package com.mypersonalassistant.app;

import static org.junit.Assert.*;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import android.content.Context;
import android.content.Intent;
import android.util.Base64;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the production image entry point, not an imitation of the OCR code. */
@RunWith(AndroidJUnit4.class)
public class TimetableRecognitionTest {
    @Test public void captureSample() throws Exception {
        Context test = InstrumentationRegistry.getInstrumentation().getContext();
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent launch = new Intent(target, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        PluginHandle handle = activity.getBridge().getPlugin("TimetableScanner");
        assertNotNull("TimetableScanner was not registered", handle);
        TimetableScannerPlugin scanner = (TimetableScannerPlugin) handle.getInstance();
        byte[] bytes;
        try (InputStream input = test.getAssets().open("timetable-sample.jpeg")) { bytes = input.readAllBytes(); }
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<JSObject> result = new AtomicReference<>();
        AtomicReference<String> failure = new AtomicReference<>();
        JSObject data = new JSObject();
        data.put("documentData", "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        PluginCall call = new PluginCall(null, "TimetableScanner", "test", "recognizeDocument", data) {
            @Override public void resolve(JSObject value) { result.set(value); done.countDown(); }
            @Override public void reject(String message, String code, Exception error, JSObject extra) {
                failure.set(message); done.countDown();
            }
        };
        scanner.recognizeDocument(call);
        assertTrue("OCR timed out", done.await(180, TimeUnit.SECONDS));
        assertNull(failure.get(), failure.get());
        assertNotNull(result.get());
        result.get().remove("previewDataUrl");
        File output = new File(target.getExternalFilesDir(null), "timetable-ocr.json");
        try (FileOutputStream stream = new FileOutputStream(output)) {
            stream.write(result.get().toString(2).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }
        assertTrue(result.get().getJSONArray("elements").length() > 30);
        activity.finish();
    }
}
