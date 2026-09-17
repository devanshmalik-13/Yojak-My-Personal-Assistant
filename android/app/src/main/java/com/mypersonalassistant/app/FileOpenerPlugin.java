package com.mypersonalassistant.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.IOException;

@CapacitorPlugin(name = "FileOpener")
public class FileOpenerPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String path = call.getString("path", "");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        if (!path.startsWith("app-data/assignments/") && !path.startsWith("app-data/competitions/")) {
            call.reject("Invalid local file path");
            return;
        }

        try {
            File dataRoot = new File(getContext().getFilesDir(), "app-data").getCanonicalFile();
            File file = new File(getContext().getFilesDir(), path).getCanonicalFile();
            if (!file.getPath().startsWith(dataRoot.getPath() + File.separator) || !file.isFile()) {
                call.reject("The saved file could not be found");
                return;
            }

            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, mimeType)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(Intent.createChooser(intent, "Open with").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (ActivityNotFoundException exception) {
            call.reject("No app is installed that can open this file", exception);
        } catch (IOException | IllegalArgumentException exception) {
            call.reject("The file could not be opened", exception);
        }
    }
}
