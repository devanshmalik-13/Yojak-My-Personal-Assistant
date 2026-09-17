package com.mypersonalassistant.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts.StartIntentSenderForResult;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanner;
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

/**
 * Small bridge activity around Google Play services' scanner flow. The full
 * scanner performs edge detection, perspective correction, rotation, shadow
 * removal and document cleanup before returning one user-approved JPEG.
 */
public class TimetableDocumentScannerActivity extends ComponentActivity {
    private ActivityResultLauncher<IntentSenderRequest> scannerLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        scannerLauncher = registerForActivityResult(new StartIntentSenderForResult(), result -> {
            if (result.getResultCode() != Activity.RESULT_OK) {
                setResult(Activity.RESULT_CANCELED);
                finish();
                return;
            }
            GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
            if (scan == null || scan.getPages() == null || scan.getPages().isEmpty()) {
                finishWithError("The scanner did not return a timetable image.");
                return;
            }
            Intent response = new Intent();
            response.putExtra("imageUri", scan.getPages().get(0).getImageUri().toString());
            setResult(Activity.RESULT_OK, response);
            finish();
        });

        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(this)
            .addOnSuccessListener(sender -> scannerLauncher.launch(new IntentSenderRequest.Builder(sender).build()))
            .addOnFailureListener(error -> finishWithError("Smart document cleanup is unavailable. Check Google Play services and your internet connection."));
    }

    private void finishWithError(String message) {
        Intent response = new Intent();
        response.putExtra("scannerError", message);
        setResult(Activity.RESULT_OK, response);
        finish();
    }
}
