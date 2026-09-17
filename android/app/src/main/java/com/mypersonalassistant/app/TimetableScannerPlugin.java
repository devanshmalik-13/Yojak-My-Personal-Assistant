package com.mypersonalassistant.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.pdf.PdfRenderer;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader;
import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.pdmodel.PDPage;
import com.tom_roush.pdfbox.text.PDFTextStripper;
import com.tom_roush.pdfbox.text.TextPosition;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@CapacitorPlugin(name = "TimetableScanner")
public class TimetableScannerPlugin extends Plugin {
    private static final int MAX_ENCODED_LENGTH = 30 * 1024 * 1024;
    private static final int MAX_PDF_BYTES = 20 * 1024 * 1024;
    private static final long MAX_PIXELS = 40_000_000L;
    // 3600px provides 44% more OCR working pixels than the previous 3000px
    // target at the same aspect ratio, which materially helps small timetable text.
    private static final int OCR_TARGET_DIMENSION = 3600;
    private static final long OCR_MAX_PIXELS = 9_000_000L;

    @PluginMethod
    public void recognizeImage(PluginCall call) {
        recognizeDocumentData(call, call.getString("imageData"));
    }

    @PluginMethod
    public void recognizeDocument(PluginCall call) {
        recognizeDocumentData(call, call.getString("documentData"));
    }

    @PluginMethod
    public void scanTimetable(PluginCall call) {
        Intent intent = new Intent(getContext(), TimetableDocumentScannerActivity.class);
        startActivityForResult(call, intent, "scanTimetableResult");
    }

    @ActivityCallback
    private void scanTimetableResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null) {
            call.reject("The timetable scan was cancelled.", "SCAN_CANCELLED");
            return;
        }
        String imageUri = activityResult.getData().getStringExtra("imageUri");
        String scannerError = activityResult.getData().getStringExtra("scannerError");
        if (imageUri == null) {
            call.reject(scannerError != null ? scannerError : "The cleaned timetable image could not be read.", "SCAN_FAILED");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(android.net.Uri.parse(imageUri));
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) throw new IOException("Scanner returned no image data");
            byte[] buffer = new byte[16 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            recognizeBitmapBytes(call, output.toByteArray());
        } catch (Exception error) {
            call.reject("The cleaned timetable image could not be read.", "SCAN_FAILED", error);
        }
    }

    private void recognizeDocumentData(PluginCall call, String data) {
        if (data == null || data.length() > MAX_ENCODED_LENGTH) {
            call.reject("Choose an image smaller than 15 MB or a PDF smaller than 20 MB.", "DOCUMENT_TOO_LARGE");
            return;
        }
        int separator = data.indexOf(',');
        if (separator < 0) {
            call.reject("The selected timetable could not be read.", "INVALID_DOCUMENT");
            return;
        }
        String header = data.substring(0, separator).toLowerCase();
        final byte[] bytes;
        try {
            bytes = Base64.decode(data.substring(separator + 1), Base64.DEFAULT);
        } catch (IllegalArgumentException exception) {
            call.reject("The selected timetable could not be read.", "INVALID_DOCUMENT");
            return;
        }
        if (header.matches("data:image/(jpeg|jpg|png|webp);base64")) {
            recognizeBitmapBytes(call, bytes);
        } else if (header.equals("data:application/pdf;base64")) {
            if (bytes.length > MAX_PDF_BYTES) {
                call.reject("Choose a PDF smaller than 20 MB.", "DOCUMENT_TOO_LARGE");
                return;
            }
            recognizePdf(call, bytes, Math.max(0, call.getInt("pageIndex", 0)));
        } else {
            call.reject("Only JPEG, PNG, WebP, and PDF timetables are supported.", "UNSUPPORTED_DOCUMENT");
        }
    }

    private void recognizeBitmapBytes(PluginCall call, byte[] bytes) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || (long) bounds.outWidth * bounds.outHeight > MAX_PIXELS) {
            call.reject("The image dimensions are invalid or too large.", "INVALID_IMAGE_SIZE");
            return;
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        while (Math.max(bounds.outWidth / options.inSampleSize, bounds.outHeight / options.inSampleSize) > OCR_TARGET_DIMENSION) options.inSampleSize *= 2;
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        if (bitmap == null) {
            call.reject("The selected image could not be decoded.", "INVALID_IMAGE");
            return;
        }
        bitmap = prepareForOcr(rotateFromExif(bitmap, bytes));
        recognizeBitmap(call, bitmap, "image", 1, makePreview(bitmap));
    }

    private void recognizePdf(PluginCall call, byte[] bytes, int requestedPage) {
        File temporaryPdf = null;
        try {
            temporaryPdf = File.createTempFile("timetable-", ".pdf", getContext().getCacheDir());
            try (FileOutputStream output = new FileOutputStream(temporaryPdf)) { output.write(bytes); }
            try (ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(temporaryPdf, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer renderer = new PdfRenderer(descriptor)) {
                if (renderer.getPageCount() < 1) throw new IOException("Empty PDF");
                int pageCount = renderer.getPageCount();
                if (requestedPage >= pageCount) {
                    call.reject("That PDF page does not exist.", "INVALID_PDF_PAGE");
                    return;
                }
                try (PdfRenderer.Page page = renderer.openPage(requestedPage)) {
                    float scale = Math.max(1f, Math.min((float) OCR_TARGET_DIMENSION / page.getWidth(), (float) OCR_TARGET_DIMENSION / page.getHeight()));
                    Bitmap bitmap = Bitmap.createBitmap(Math.round(page.getWidth() * scale), Math.round(page.getHeight() * scale), Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(bitmap);
                    canvas.drawColor(Color.WHITE);
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    bitmap = prepareForOcr(bitmap);
                    String preview = makePreview(bitmap);
                    if (!recognizePositionedPdf(call, bytes, pageCount, requestedPage, preview)) {
                        recognizeBitmap(call, bitmap, "pdf", pageCount, requestedPage, preview);
                    } else {
                        bitmap.recycle();
                    }
                }
            }
        } catch (Exception exception) {
            call.reject("This PDF could not be opened. It may be encrypted, damaged, or unsupported.", "INVALID_PDF", exception);
        } finally {
            if (temporaryPdf != null && temporaryPdf.exists()) temporaryPdf.delete();
        }
    }

    private boolean recognizePositionedPdf(PluginCall call, byte[] bytes, int pageCount, int pageIndex, String previewDataUrl) {
        try {
            PDFBoxResourceLoader.init(getContext());
            try (PDDocument document = PDDocument.load(bytes)) {
                PDPage page = document.getPage(pageIndex);
                PositionedTextStripper stripper = new PositionedTextStripper();
                stripper.setStartPage(pageIndex + 1);
                stripper.setEndPage(pageIndex + 1);
                stripper.getText(document);
                PositionedTextResult positioned = buildPositionedText(stripper.positions);
                String lowerText = positioned.fullText.toLowerCase();
                int weekdayCount = 0;
                for (String weekday : new String[]{"monday", "tuesday", "wednesday", "thursday", "friday"}) {
                    if (lowerText.contains(weekday)) weekdayCount++;
                }
                if (positioned.elements.length() < 20 || weekdayCount < 2) return false;
                JSObject response = new JSObject();
                response.put("width", Math.round(page.getMediaBox().getWidth()));
                response.put("height", Math.round(page.getMediaBox().getHeight()));
                response.put("fullText", positioned.fullText);
                response.put("sourceType", "pdf");
                response.put("pageCount", pageCount);
                response.put("pageIndex", pageIndex);
                response.put("previewDataUrl", previewDataUrl);
                response.put("lines", positioned.lines);
                response.put("elements", positioned.elements);
                response.put("extractionMode", "embeddedText");
                call.resolve(response);
                return true;
            }
        } catch (Exception ignored) {
            return false;
        }
    }

    private PositionedTextResult buildPositionedText(List<TextPosition> positions) {
        List<List<TextPosition>> rows = new ArrayList<>();
        positions.sort(Comparator.comparingDouble(TextPosition::getYDirAdj).thenComparingDouble(TextPosition::getXDirAdj));
        for (TextPosition position : positions) {
            if (position.getUnicode() == null || position.getUnicode().trim().isEmpty()) continue;
            List<TextPosition> row = null;
            for (List<TextPosition> candidate : rows) {
                TextPosition first = candidate.get(0);
                if (Math.abs(first.getYDirAdj() - position.getYDirAdj()) <= Math.max(first.getHeightDir(), position.getHeightDir()) * 0.55f) {
                    row = candidate;
                    break;
                }
            }
            if (row == null) {
                row = new ArrayList<>();
                rows.add(row);
            }
            row.add(position);
        }
        rows.sort(Comparator.comparingDouble(row -> row.get(0).getYDirAdj()));
        JSArray lineObjects = new JSArray();
        JSArray wordObjects = new JSArray();
        StringBuilder fullText = new StringBuilder();
        for (List<TextPosition> row : rows) {
            row.sort(Comparator.comparingDouble(TextPosition::getXDirAdj));
            List<List<TextPosition>> words = new ArrayList<>();
            for (TextPosition glyph : row) {
                List<TextPosition> word = words.isEmpty() ? null : words.get(words.size() - 1);
                if (word == null) {
                    word = new ArrayList<>();
                    words.add(word);
                } else {
                    TextPosition previous = word.get(word.size() - 1);
                    float gap = glyph.getXDirAdj() - (previous.getXDirAdj() + previous.getWidthDirAdj());
                    float threshold = Math.max(1.2f, Math.min(previous.getWidthOfSpace(), glyph.getWidthOfSpace()) * 0.45f);
                    if (gap > threshold) {
                        word = new ArrayList<>();
                        words.add(word);
                    }
                }
                word.add(glyph);
            }
            List<TextPosition> completeLine = new ArrayList<>();
            StringBuilder lineText = new StringBuilder();
            for (List<TextPosition> word : words) {
                String text = textOf(word);
                if (text.isEmpty()) continue;
                JSObject wordObject = pdfBoxObject(text, word);
                if (wordObject != null) wordObjects.put(wordObject);
                if (lineText.length() > 0) lineText.append(' ');
                lineText.append(text);
                completeLine.addAll(word);
            }
            if (lineText.length() > 0) {
                JSObject lineObject = pdfBoxObject(lineText.toString(), completeLine);
                if (lineObject != null) lineObjects.put(lineObject);
                if (fullText.length() > 0) fullText.append('\n');
                fullText.append(lineText);
            }
        }
        return new PositionedTextResult(fullText.toString(), lineObjects, wordObjects);
    }

    private String textOf(List<TextPosition> positions) {
        StringBuilder result = new StringBuilder();
        for (TextPosition position : positions) result.append(position.getUnicode());
        return result.toString().trim();
    }

    private JSObject pdfBoxObject(String text, List<TextPosition> positions) {
        if (text.isEmpty() || positions.isEmpty()) return null;
        float left = Float.MAX_VALUE, top = Float.MAX_VALUE, right = 0, bottom = 0;
        for (TextPosition position : positions) {
            left = Math.min(left, position.getXDirAdj());
            top = Math.min(top, position.getYDirAdj() - position.getHeightDir());
            right = Math.max(right, position.getXDirAdj() + position.getWidthDirAdj());
            bottom = Math.max(bottom, position.getYDirAdj());
        }
        JSObject object = new JSObject();
        object.put("text", text);
        object.put("left", Math.round(left));
        object.put("top", Math.round(top));
        object.put("right", Math.round(right));
        object.put("bottom", Math.round(bottom));
        return object;
    }

    private static class PositionedTextStripper extends PDFTextStripper {
        final List<TextPosition> positions = new ArrayList<>();
        PositionedTextStripper() throws IOException { setSortByPosition(true); }
        @Override protected void processTextPosition(TextPosition text) {
            positions.add(text);
            super.processTextPosition(text);
        }
    }

    private static class PositionedTextResult {
        final String fullText;
        final JSArray lines;
        final JSArray elements;
        PositionedTextResult(String fullText, JSArray lines, JSArray elements) {
            this.fullText = fullText;
            this.lines = lines;
            this.elements = elements;
        }
    }

    private void recognizeBitmap(PluginCall call, Bitmap bitmap, String sourceType, int pageCount, String previewDataUrl) {
        recognizeBitmap(call, bitmap, sourceType, pageCount, 0, previewDataUrl);
    }

    private void recognizeBitmap(PluginCall call, Bitmap bitmap, String sourceType, int pageCount, int pageIndex, String previewDataUrl) {
        final Bitmap scannedBitmap = bitmap;
        final Bitmap enhancedBitmap = enhanceForOcr(scannedBitmap);
        final int scanWidth = scannedBitmap.getWidth();
        final int scanHeight = scannedBitmap.getHeight();
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer.process(InputImage.fromBitmap(scannedBitmap, 0)).addOnCompleteListener(originalTask ->
            recognizer.process(InputImage.fromBitmap(enhancedBitmap, 0)).addOnCompleteListener(enhancedTask -> {
                if (scannedBitmap != enhancedBitmap && !scannedBitmap.isRecycled()) scannedBitmap.recycle();
                final Bitmap deblurredBitmap = deblurForOcr(enhancedBitmap);
                recognizer.process(InputImage.fromBitmap(deblurredBitmap, 0)).addOnCompleteListener(deblurredTask -> {
                    if (!enhancedBitmap.isRecycled()) enhancedBitmap.recycle();
                    final Bitmap binaryBitmap = binarizeForOcr(deblurredBitmap);
                    recognizer.process(InputImage.fromBitmap(binaryBitmap, 0)).addOnCompleteListener(binaryTask -> {
                        Text best = null;
                        String mode = "originalImage";
                        int bestScore = Integer.MIN_VALUE;
                        if (originalTask.isSuccessful()) {
                            best = originalTask.getResult();
                            bestScore = ocrQuality(best);
                        }
                        if (enhancedTask.isSuccessful() && ocrQuality(enhancedTask.getResult()) > bestScore) {
                            best = enhancedTask.getResult();
                            bestScore = ocrQuality(best);
                            mode = "enhancedImage";
                        }
                        if (deblurredTask.isSuccessful() && ocrQuality(deblurredTask.getResult()) > bestScore) {
                            best = deblurredTask.getResult();
                            bestScore = ocrQuality(best);
                            mode = "deblurredImage";
                        }
                        if (binaryTask.isSuccessful() && ocrQuality(binaryTask.getResult()) > bestScore) {
                            best = binaryTask.getResult();
                            mode = "binaryImage";
                        }
                        if (best == null) {
                            Exception error = binaryTask.getException() != null ? binaryTask.getException()
                                : deblurredTask.getException() != null ? deblurredTask.getException()
                                : enhancedTask.getException() != null ? enhancedTask.getException() : originalTask.getException();
                            call.reject("Text recognition failed. Try a clearer image or the original PDF.", "OCR_FAILED", error);
                        } else {
                            List<Text> successfulResults = new ArrayList<>();
                            if (originalTask.isSuccessful()) successfulResults.add(originalTask.getResult());
                            if (enhancedTask.isSuccessful()) successfulResults.add(enhancedTask.getResult());
                            if (deblurredTask.isSuccessful()) successfulResults.add(deblurredTask.getResult());
                            if (binaryTask.isSuccessful()) successfulResults.add(binaryTask.getResult());
                            resolveOcr(call, best, successfulResults, scanWidth, scanHeight, sourceType, pageCount, pageIndex, previewDataUrl,
                                successfulResults.size() > 1 ? "mergedImage" : mode);
                        }
                        if (!binaryBitmap.isRecycled()) binaryBitmap.recycle();
                        if (!deblurredBitmap.isRecycled()) deblurredBitmap.recycle();
                        recognizer.close();
                    });
                });
            })
        );
    }

    private void resolveOcr(PluginCall call, Text result, List<Text> successfulResults, int width, int height, String sourceType, int pageCount, int pageIndex, String previewDataUrl, String extractionMode) {
        JSObject response = new JSObject();
        response.put("width", width);
        response.put("height", height);
        response.put("fullText", result.getText());
        response.put("sourceType", sourceType);
        response.put("pageCount", pageCount);
        response.put("pageIndex", pageIndex);
        response.put("extractionMode", extractionMode);
        if (previewDataUrl != null) response.put("previewDataUrl", previewDataUrl);
        response.put("lines", mergeOcrBoxes(successfulResults, true));
        response.put("elements", mergeOcrBoxes(successfulResults, false));
        call.resolve(response);
    }

    private JSArray mergeOcrBoxes(List<Text> results, boolean linesOnly) {
        List<OcrCandidate> merged = new ArrayList<>();
        for (Text result : results) {
            for (Text.TextBlock block : result.getTextBlocks()) {
                for (Text.Line line : block.getLines()) {
                    if (linesOnly) addOcrCandidate(merged, line.getText(), line.getBoundingBox());
                    else for (Text.Element element : line.getElements()) {
                        addOcrCandidate(merged, element.getText(), element.getBoundingBox());
                    }
                }
            }
        }
        merged.sort(Comparator.comparingInt((OcrCandidate item) -> item.bounds.top).thenComparingInt(item -> item.bounds.left));
        JSArray boxes = new JSArray();
        for (OcrCandidate candidate : merged) {
            JSObject object = boxObject(candidate.text, candidate.bounds);
            if (object != null) boxes.put(object);
        }
        return boxes;
    }

    private void addOcrCandidate(List<OcrCandidate> merged, String text, Rect bounds) {
        if (bounds == null || text == null || text.trim().isEmpty()) return;
        for (int index = 0; index < merged.size(); index++) {
            OcrCandidate existing = merged.get(index);
            int left = Math.max(existing.bounds.left, bounds.left);
            int top = Math.max(existing.bounds.top, bounds.top);
            int right = Math.min(existing.bounds.right, bounds.right);
            int bottom = Math.min(existing.bounds.bottom, bounds.bottom);
            if (right <= left || bottom <= top) continue;
            long intersection = (long) (right - left) * (bottom - top);
            long existingArea = Math.max(1L, (long) existing.bounds.width() * existing.bounds.height());
            long newArea = Math.max(1L, (long) bounds.width() * bounds.height());
            if ((double) intersection / Math.min(existingArea, newArea) < 0.58) continue;
            if (ocrTextScore(text) > ocrTextScore(existing.text)) merged.set(index, new OcrCandidate(text.trim(), new Rect(bounds)));
            return;
        }
        merged.add(new OcrCandidate(text.trim(), new Rect(bounds)));
    }

    private int ocrTextScore(String text) {
        int useful = text.replaceAll("[^A-Za-z0-9]", "").length();
        int suspicious = text.replaceAll("[A-Za-z0-9 .:/&-]", "").length();
        return useful * 4 + text.trim().length() - suspicious * 3;
    }

    private static class OcrCandidate {
        final String text;
        final Rect bounds;
        OcrCandidate(String text, Rect bounds) { this.text = text; this.bounds = bounds; }
    }

    private int ocrQuality(Text result) {
        String lower = result.getText().toLowerCase();
        String normalized = lower.replace('0', 'o').replace('1', 'i').replace('5', 's').replaceAll("[^a-z]", "");
        int score = Math.min(300, result.getText().replaceAll("\\s", "").length());
        int elementCount = 0;
        for (Text.TextBlock block : result.getTextBlocks()) {
            for (Text.Line line : block.getLines()) elementCount += line.getElements().size();
        }
        score += Math.min(300, elementCount * 3);
        for (String day : new String[]{"monday", "tuesday", "wednesday", "thursday", "friday"}) {
            if (normalized.contains(day) || normalized.contains(day.substring(1))) score += 140;
        }
        String[] tokens = lower.split("\\s+");
        for (String token : tokens) {
            if (token.matches(".*\\d{1,2}[:.]\\d{2}.*")) score += 25;
            if (token.matches("(?:[1-9]|1[0-2])")) score += 8;
        }
        return score;
    }

    private Bitmap binarizeForOcr(Bitmap source) {
        int width = source.getWidth(), height = source.getHeight();
        int[] pixels = new int[width * height];
        int[] histogram = new int[256];
        source.getPixels(pixels, 0, width, 0, 0, width, height);
        for (int color : pixels) histogram[luminance(color)]++;

        long total = (long) width * height;
        long weightedTotal = 0;
        for (int value = 0; value < 256; value++) weightedTotal += (long) value * histogram[value];
        long backgroundWeight = 0;
        long backgroundSum = 0;
        double bestVariance = -1;
        int threshold = 160;
        for (int value = 0; value < 256; value++) {
            backgroundWeight += histogram[value];
            if (backgroundWeight == 0) continue;
            long foregroundWeight = total - backgroundWeight;
            if (foregroundWeight == 0) break;
            backgroundSum += (long) value * histogram[value];
            double backgroundMean = (double) backgroundSum / backgroundWeight;
            double foregroundMean = (double) (weightedTotal - backgroundSum) / foregroundWeight;
            double variance = (double) backgroundWeight * foregroundWeight * Math.pow(backgroundMean - foregroundMean, 2);
            if (variance > bestVariance) {
                bestVariance = variance;
                threshold = value;
            }
        }
        // A small upward bias retains thin, light-coloured glyph strokes.
        threshold = Math.min(225, threshold + 12);
        for (int index = 0; index < pixels.length; index++) {
            int value = luminance(pixels[index]) <= threshold ? 0 : 255;
            pixels[index] = Color.rgb(value, value, value);
        }
        Bitmap binary = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        binary.setPixels(pixels, 0, width, 0, 0, width, height);
        return binary;
    }

    private Bitmap deblurForOcr(Bitmap source) {
        int width = source.getWidth(), height = source.getHeight();
        int[] input = new int[width * height];
        int[] output = new int[input.length];
        source.getPixels(input, 0, width, 0, 0, width, height);

        // Estimate edge energy. Low edge energy indicates mild defocus or
        // motion blur, in which case a stronger high-boost restoration helps.
        double edgeEnergy = 0;
        long samples = 0;
        int step = Math.max(1, Math.min(width, height) / 900);
        for (int y = step; y < height - step; y += step) {
            for (int x = step; x < width - step; x += step) {
                int index = y * width + x;
                int center = luminance(input[index]);
                int laplacian = 4 * center - luminance(input[index - step]) - luminance(input[index + step])
                    - luminance(input[index - step * width]) - luminance(input[index + step * width]);
                edgeEnergy += Math.abs(laplacian);
                samples++;
            }
        }
        float strength = samples > 0 && edgeEnergy / samples < 18 ? 2.0f : 1.15f;
        for (int y = 0; y < height; y++) {
            int row = y * width;
            for (int x = 0; x < width; x++) {
                int index = row + x;
                int center = luminance(input[index]);
                int neighbours = 0;
                int count = 0;
                for (int offsetY = -1; offsetY <= 1; offsetY++) {
                    int sourceY = Math.max(0, Math.min(height - 1, y + offsetY));
                    for (int offsetX = -1; offsetX <= 1; offsetX++) {
                        if (offsetX == 0 && offsetY == 0) continue;
                        int sourceX = Math.max(0, Math.min(width - 1, x + offsetX));
                        neighbours += luminance(input[sourceY * width + sourceX]);
                        count++;
                    }
                }
                int localBlur = neighbours / Math.max(1, count);
                int restored = Math.max(0, Math.min(255, Math.round(center + strength * (center - localBlur))));
                output[index] = Color.rgb(restored, restored, restored);
            }
        }
        Bitmap deblurred = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        deblurred.setPixels(output, 0, width, 0, 0, width, height);
        return deblurred;
    }

    private Bitmap enhanceForOcr(Bitmap source) {
        int width = source.getWidth(), height = source.getHeight();
        int[] input = new int[width * height];
        int[] output = new int[input.length];
        int[] histogram = new int[256];
        source.getPixels(input, 0, width, 0, 0, width, height);
        int darkPixels = 0;
        for (int color : input) {
            int gray = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
            if (gray < 128) darkPixels++;
        }
        boolean invert = darkPixels > input.length * 0.55;
        for (int color : input) histogram[invert ? 255 - luminance(color) : luminance(color)]++;
        int lowTarget = Math.max(1, input.length / 100), highTarget = Math.max(1, input.length * 99 / 100);
        int cumulative = 0, low = 0, high = 255;
        for (int value = 0; value < 256; value++) {
            cumulative += histogram[value];
            if (cumulative >= lowTarget) { low = value; break; }
        }
        cumulative = 0;
        for (int value = 0; value < 256; value++) {
            cumulative += histogram[value];
            if (cumulative >= highTarget) { high = value; break; }
        }
        if (high - low < 70) { low = Math.max(0, low - 35); high = Math.min(255, high + 35); }
        int range = Math.max(1, high - low);
        for (int y = 0; y < height; y++) {
            int row = y * width;
            for (int x = 0; x < width; x++) {
                int index = row + x;
                int color = input[index];
                int center = invert ? 255 - luminance(color) : luminance(color);
                int left = x > 0 ? (invert ? 255 - luminance(input[index - 1]) : luminance(input[index - 1])) : center;
                int right = x + 1 < width ? (invert ? 255 - luminance(input[index + 1]) : luminance(input[index + 1])) : center;
                int up = y > 0 ? (invert ? 255 - luminance(input[index - width]) : luminance(input[index - width])) : center;
                int down = y + 1 < height ? (invert ? 255 - luminance(input[index + width]) : luminance(input[index + width])) : center;
                int sharpened = center + Math.round(0.7f * (4 * center - left - right - up - down));
                int contrasted = Math.max(0, Math.min(255, (sharpened - low) * 255 / range));
                output[index] = Color.rgb(contrasted, contrasted, contrasted);
            }
        }
        Bitmap enhanced = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        enhanced.setPixels(output, 0, width, 0, 0, width, height);
        return enhanced;
    }

    private int luminance(int color) {
        return (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
    }

    private Bitmap prepareForOcr(Bitmap source) {
        Rect content = detectContentBounds(source);
        Bitmap cropped = source;
        if (content.width() < source.getWidth() * 0.94f || content.height() < source.getHeight() * 0.94f) {
            cropped = Bitmap.createBitmap(source, content.left, content.top, content.width(), content.height());
            if (cropped != source) source.recycle();
        }
        int largest = Math.max(cropped.getWidth(), cropped.getHeight());
        float dimensionScale = (float) OCR_TARGET_DIMENSION / largest;
        float pixelScale = (float) Math.sqrt((double) OCR_MAX_PIXELS / ((long) cropped.getWidth() * cropped.getHeight()));
        float scale = Math.min(dimensionScale, pixelScale);
        if (scale >= 0.98f && scale <= 1.02f) return cropped;
        Bitmap scaled = Bitmap.createScaledBitmap(cropped, Math.max(1, Math.round(cropped.getWidth() * scale)), Math.max(1, Math.round(cropped.getHeight() * scale)), true);
        if (scaled != cropped) cropped.recycle();
        return scaled;
    }

    private Rect detectContentBounds(Bitmap bitmap) {
        int width = bitmap.getWidth(), height = bitmap.getHeight();
        int step = Math.max(2, Math.min(width, height) / 500);
        int minX = width, minY = height, maxX = -1, maxY = -1;
        for (int y = 0; y < height; y += step) {
            for (int x = 0; x < width; x += step) {
                int color = bitmap.getPixel(x, y);
                int luminance = (Color.red(color) * 299 + Color.green(color) * 587 + Color.blue(color) * 114) / 1000;
                if (luminance < 225) {
                    minX = Math.min(minX, x); minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                }
            }
        }
        if (maxX < minX || maxY < minY) return new Rect(0, 0, width, height);
        int padding = Math.max(12, Math.min(width, height) / 50);
        int left = Math.max(0, minX - padding), top = Math.max(0, minY - padding);
        int right = Math.min(width, maxX + padding + step), bottom = Math.min(height, maxY + padding + step);
        if (right - left < width * 0.35f || bottom - top < height * 0.2f) return new Rect(0, 0, width, height);
        return new Rect(left, top, right, bottom);
    }

    private String makePreview(Bitmap bitmap) {
        int max = Math.max(bitmap.getWidth(), bitmap.getHeight());
        float scale = Math.min(1f, 1400f / max);
        Bitmap preview = scale < 1f ? Bitmap.createScaledBitmap(bitmap, Math.round(bitmap.getWidth() * scale), Math.round(bitmap.getHeight() * scale), true) : bitmap;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        preview.compress(Bitmap.CompressFormat.JPEG, 82, output);
        if (preview != bitmap) preview.recycle();
        return "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
    }

    private JSObject boxObject(String text, Rect bounds) {
        if (bounds == null || text == null || text.trim().isEmpty()) return null;
        JSObject object = new JSObject();
        object.put("text", text); object.put("left", bounds.left); object.put("top", bounds.top);
        object.put("right", bounds.right); object.put("bottom", bounds.bottom);
        return object;
    }

    private Bitmap rotateFromExif(Bitmap source, byte[] bytes) {
        try {
            ExifInterface exif = new ExifInterface(new ByteArrayInputStream(bytes));
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            float degrees = orientation == ExifInterface.ORIENTATION_ROTATE_90 ? 90 : orientation == ExifInterface.ORIENTATION_ROTATE_180 ? 180 : orientation == ExifInterface.ORIENTATION_ROTATE_270 ? 270 : 0;
            if (degrees == 0) return source;
            Matrix matrix = new Matrix(); matrix.postRotate(degrees);
            Bitmap rotated = Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
            if (rotated != source) source.recycle();
            return rotated;
        } catch (IOException ignored) { return source; }
    }
}
