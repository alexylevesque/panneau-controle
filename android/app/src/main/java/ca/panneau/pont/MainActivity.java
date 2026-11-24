package ca.panneau.pont;

import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

// Petit écran d'état : ce que fait le pont, et un bouton pour oublier l'iPhone.
public class MainActivity extends Activity {
    private TextView etat, journal;
    private final Handler h = new Handler();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setPadding(48, 48, 48, 48);
        l.setBackgroundColor(Color.rgb(17, 22, 44));

        TextView titre = new TextView(this);
        titre.setText("Pont iPhone");
        titre.setTextSize(30); titre.setTextColor(Color.WHITE);
        l.addView(titre);

        TextView aide = new TextView(this);
        aide.setText("Cette appli relie tes iPhone au panneau par Bluetooth (autant que tu veux). Laisse-la tourner : "
            + "la notification « Pont iPhone actif » la garde en vie.\n\n"
            + "Première fois : sur l'iPhone, ouvre l'appli gratuite « nRF Connect », touche SCAN, "
            + "puis CONNECT à côté de « Panneau ». Accepte le jumelage et « Partager les notifications ».\n\n"
            + "Autre iPhone : fais d'abord rouler son raccourci Panneau une fois, puis la même chose avec nRF Connect.");
        aide.setTextSize(16); aide.setTextColor(Color.rgb(170, 178, 205));
        aide.setPadding(0, 16, 0, 24);
        l.addView(aide);

        etat = new TextView(this);
        etat.setTextSize(20); etat.setTextColor(Color.rgb(95, 211, 154));
        l.addView(etat);

        Button oublier = new Button(this);
        oublier.setText("Oublier les iPhone");
        oublier.setOnClickListener(v -> { PontService.oublier(this); });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.START; lp.topMargin = 20;
        l.addView(oublier, lp);

        journal = new TextView(this);
        journal.setTextSize(13); journal.setTextColor(Color.rgb(140, 150, 180));
        journal.setPadding(0, 24, 0, 0);
        ScrollView sv = new ScrollView(this);
        sv.addView(journal);
        l.addView(sv, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(l);

        BluetoothAdapter ba = BluetoothAdapter.getDefaultAdapter();
        if (ba != null && !ba.isEnabled()) startActivity(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE));
        // Android 6 : la recherche des AirPods demande la permission de localisation
        if (android.os.Build.VERSION.SDK_INT >= 23
            && checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { android.Manifest.permission.ACCESS_COARSE_LOCATION }, 1);
        }
        PontService.demarrer(this);
        rafraichir();
    }

    private void rafraichir() {
        etat.setText(PontService.etat);
        journal.setText(PontService.journal());
        h.postDelayed(this::rafraichir, 1000);
    }

    @Override public void onRequestPermissionsResult(int code, String[] p, int[] r) {
        // On relance le service pour qu'il recommence la recherche des AirPods
        stopService(new Intent(this, PontService.class));
        PontService.demarrer(this);
    }

    @Override protected void onDestroy() { h.removeCallbacksAndMessages(null); super.onDestroy(); }
}
