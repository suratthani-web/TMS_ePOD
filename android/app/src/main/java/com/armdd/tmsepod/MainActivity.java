package com.armdd.tmsepod;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ขอสิทธิ์กล้องแบบ runtime — จำเป็นสำหรับ getUserMedia ที่ตัวสแกนลาเบล/QR ใช้
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{ Manifest.permission.CAMERA }, 100);
        }

        // ปล่อยสิทธิ์กล้องให้ WebView (getUserMedia) โดยยังคง behavior เดิมของ Capacitor
        // (extend BridgeWebChromeClient → file chooser/POD photo capture ยังทำงานปกติ)
        final WebView webView = this.getBridge().getWebView();
        webView.setWebChromeClient(new BridgeWebChromeClient(this.getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        request.grant(request.getResources());
                    }
                });
            }
        });
    }
}
