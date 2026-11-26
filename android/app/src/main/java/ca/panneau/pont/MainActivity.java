package ca.panneau.pont;

import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

// Écran de l'appli : une page dans le style du panneau (assets/pont.html) qui montre l'état du pont.
public class MainActivity extends Activity {
    private WebView web;

    // Ce que la page peut demander à l'appli
    public class Pont {
        @JavascriptInterface public String donnees() {
            String v = "";
            try { v = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { }
            return PontService.donnees(v);
        }
        @JavascriptInterface public void oublier() { PontService.oublier(MainActivity.this); }
    }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11, 16, 32));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        web.setWebChromeClient(new WebChromeClient());   // pour que confirm() fonctionne
        web.addJavascriptInterface(new Pont(), "Pont");
        web.loadUrl("file:///android_asset/pont.html");
        setContentView(web);

        BluetoothAdapter ba = BluetoothAdapter.getDefaultAdapter();
        if (ba != null && !ba.isEnabled()) startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
        // Android 6 : la recherche des AirPods demande la permission de localisation
        if (android.os.Build.VERSION.SDK_INT >= 23
            && checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_COARSE_LOCATION }, 1);
        }
        PontService.demarrer(this);
    }

    @Override public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        // On relance le service pour qu'il recommence la recherche des AirPods
        stopService(new Intent(this, PontService.class));
        PontService.demarrer(this);
    }

    @Override protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
