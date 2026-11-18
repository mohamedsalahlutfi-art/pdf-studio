package com.mocall.personal;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/**
 * Native Android container for the user's OWN HTTPS-hosted MoCall instance.
 * No Jitsi, no third-party meetings, no exposed JavascriptInterface.
 */
public final class MainActivity extends Activity {
    private static final String PREF = "mocall_private";
    private static final int MEDIA_PERMISSION_CODE = 41;
    private WebView view;
    private String serverOrigin;
    private PermissionRequest pendingPermission;
    private String[] pendingResources;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(8,15,34));
        getWindow().setNavigationBarColor(Color.rgb(8,15,34));
        view = new WebView(this);
        view.setBackgroundColor(Color.rgb(8,15,34));
        view.getSettings().setJavaScriptEnabled(true);
        view.getSettings().setDomStorageEnabled(true);
        view.getSettings().setMediaPlaybackRequiresUserGesture(false);
        view.getSettings().setAllowFileAccess(true);
        view.getSettings().setAllowContentAccess(false);
        view.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        view.getSettings().setAllowFileAccessFromFileURLs(false);
        view.getSettings().setAllowUniversalAccessFromFileURLs(false);
        view.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> permitMediaIfTrusted(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingPermission == request) {
                    pendingPermission = null;
                    pendingResources = null;
                }
            }
        });
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView web, WebResourceRequest request) {
                return handleUri(request.getUrl());
            }
            @Override public void onReceivedError(WebView web, WebResourceRequest req,
                                                    android.webkit.WebResourceError error) {
                if (req.isForMainFrame()) {
                    Toast.makeText(MainActivity.this, "تعذر فتح الخادم — تحقق من الاتصال والعنوان", Toast.LENGTH_LONG).show();
                }
            }
        });
        setContentView(view);
        String remembered = getPreferences(MODE_PRIVATE).getString(PREF, null);
        if (remembered != null && validOrigin(remembered) != null) openServer(remembered);
        else showSetup();
    }

    private String validOrigin(String raw) {
        try {
            URI uri = new URI(raw.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) ||
                uri.getHost() == null || uri.getHost().isEmpty() ||
                uri.getUserInfo() != null || uri.getRawQuery() != null ||
                uri.getRawFragment() != null ||
                !(uri.getPath() == null || uri.getPath().isEmpty() || uri.getPath().equals("/"))) return null;
            int port=uri.getPort();
            if (port < -1 || port == 0 || port > 65535) return null;
            String host=uri.getHost().toLowerCase(java.util.Locale.ROOT);
            return "https://" + host + (port > 0 && port != 443 ? ":" + port : "");
        } catch (Exception ignored) { return null; }
    }
    private void showSetup() {
        serverOrigin = null;
        view.loadUrl("file:///android_asset/setup.html");
    }
    private void openServer(String raw) {
        final String origin = validOrigin(raw);
        if (origin == null) {
            Toast.makeText(this,"يجب إدخال رابط HTTPS صحيح",Toast.LENGTH_LONG).show();
            return;
        }
        serverOrigin = origin;
        getPreferences(MODE_PRIVATE).edit().putString(PREF, origin).apply();
        view.loadUrl(origin + "/");
    }
    private boolean handleUri(Uri uri) {
        String scheme=uri.getScheme();
        if ("mocall".equals(scheme)) {
            String action=uri.getHost();
            if ("configure".equals(action)) {
                openServer(uri.getQueryParameter("url"));
            } else if ("settings".equals(action)) {
                showSetup();
            } else if ("share".equals(action) && serverOrigin != null) {
                String text=uri.getQueryParameter("text");
                if (text != null && text.length() <= 1000) {
                    Intent intent=new Intent(Intent.ACTION_SEND);
                    intent.setType("text/plain");
                    intent.putExtra(Intent.EXTRA_TEXT,text);
                    startActivity(Intent.createChooser(intent,"مشاركة رابط الاتصال"));
                }
            }
            return true;
        }
        if ("https".equals(scheme) && serverOrigin != null) {
            String candidate = validOrigin(uri.getScheme() + "://" + uri.getEncodedAuthority());
            if (serverOrigin.equals(candidate)) return false;
            try {
                Intent browser = new Intent(Intent.ACTION_VIEW, uri);
                browser.addCategory(Intent.CATEGORY_BROWSABLE);
                startActivity(browser);
            } catch (Exception ignored) {}
            return true;
        }
        if ("file".equals(scheme) && uri.toString().equals("file:///android_asset/setup.html")) return false;
        return true;
    }

    private void permitMediaIfTrusted(PermissionRequest req) {
        final Uri origin=req.getOrigin();
        final String current=origin != null ? validOrigin(origin.toString()) : null;
        if (serverOrigin == null || !serverOrigin.equals(current)) {
            req.deny(); return;
        }
        List<String> acceptedResources=new ArrayList<>();
        List<String> neededPermissions=new ArrayList<>();
        for (String item : req.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(item)) {
                acceptedResources.add(item);
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    neededPermissions.add(Manifest.permission.RECORD_AUDIO);
                }
            } else if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(item)) {
                acceptedResources.add(item);
                if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    neededPermissions.add(Manifest.permission.CAMERA);
                }
            } else {
                req.deny(); return;
            }
        }
        if (acceptedResources.isEmpty()) { req.deny(); return; }
        if (neededPermissions.isEmpty()) { req.grant(acceptedResources.toArray(new String[0])); return; }
        if (pendingPermission != null) { req.deny(); return; }
        pendingPermission=req;
        pendingResources=acceptedResources.toArray(new String[0]);
        requestPermissions(neededPermissions.toArray(new String[0]),MEDIA_PERMISSION_CODE);
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if (requestCode != MEDIA_PERMISSION_CODE || pendingPermission == null) return;
        PermissionRequest req=pendingPermission;
        String[] resources=pendingResources;
        pendingPermission=null;
        pendingResources=null;
        boolean allGranted = true;
        for (int i=0; i<permissions.length; i++) {
            if (i>=results.length || results[i] != PackageManager.PERMISSION_GRANTED) allGranted = false;
        }
        if (allGranted) req.grant(resources);
        else req.deny();
    }
    @Override public void onBackPressed() {
        if (view != null && view.canGoBack()) view.goBack();
        else if (serverOrigin != null) showSetup();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (pendingPermission != null) pendingPermission.deny();
        if (view != null) {
            view.stopLoading();
            view.destroy();
            view=null;
        }
        super.onDestroy();
    }
}
