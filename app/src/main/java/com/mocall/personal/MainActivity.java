package com.mocall.personal;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(12, 18, 36));
        getWindow().setNavigationBarColor(Color.rgb(12, 18, 36));
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(12, 18, 36));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) return false;
                if ("https".equals(uri.getScheme())) launchBrowser(uri.toString());
                return true;
            }
        });
        webView.addJavascriptInterface(new NativeBridge(), "Native");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
    }

    private void launchBrowser(String value) {
        if (value == null || !value.matches("^https://meet\\.jit\\.si/[A-Za-z0-9_-]{4,100}$")) {
            Toast.makeText(this, "Invalid meeting link", Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(value));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (Exception ex) {
            Toast.makeText(this, "No compatible browser installed", Toast.LENGTH_LONG).show();
        }
    }

    private class NativeBridge {
        @JavascriptInterface public void openMeeting(String url) {
            runOnUiThread(() -> launchBrowser(url));
        }
        @JavascriptInterface public void copyText(String text) {
            runOnUiThread(() -> {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("MoCall invitation", text));
                Toast.makeText(MainActivity.this, "تم نسخ الرابط", Toast.LENGTH_SHORT).show();
            });
        }
        @JavascriptInterface public void shareInvitation(String text) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(send, "مشاركة دعوة المكالمة"));
            });
        }
    }
    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if (webView != null) {webView.removeJavascriptInterface("Native");webView.destroy();webView=null;}
        super.onDestroy();
    }
}
