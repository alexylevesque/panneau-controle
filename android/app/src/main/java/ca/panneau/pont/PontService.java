package ca.panneau.pont;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelUuid;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.Date;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Pont Bluetooth entre l'iPhone et le panneau.
 * La tablette agit comme une montre : elle lit les notifications de l'iPhone (ANCS d'Apple)
 * et les envoie au panneau (http://127.0.0.1:8080). Elle peut aussi accepter / refuser un appel.
 */
public class PontService extends Service {
    // Service ANCS d'Apple
    static final UUID ANCS = UUID.fromString("7905F431-B5CE-4E99-A40F-4B1E122D00D0");
    static final UUID NOTIF_SOURCE = UUID.fromString("9FBF120D-6301-42D9-8C58-25E699A21DBD");
    static final UUID CONTROL_POINT = UUID.fromString("69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9");
    static final UUID DATA_SOURCE = UUID.fromString("22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB");
    static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    // Notre propre service (pour que l'iPhone nous trouve sous le nom « Panneau »)
    static final UUID MON_SERVICE = UUID.fromString("5a1e0001-7a3b-4c2d-9e10-70616e6e6561");
    static final UUID MA_CARAC = UUID.fromString("5a1e0002-7a3b-4c2d-9e10-70616e6e6561");

    static final String PANNEAU = "http://127.0.0.1:8080/api/appareils/action/";

    static volatile String etat = "Démarrage…";
    private static final LinkedList<String> JOURNAL = new LinkedList<>();

    private final Handler h = new Handler(Looper.getMainLooper());
    private BluetoothManager bm;
    private BluetoothAdapter ba;
    private BluetoothGattServer serveur;
    private BluetoothLeAdvertiser annonceur;
    private BluetoothGatt gatt;
    private SharedPreferences prefs;
    private boolean actif = false;

    // Demandes d'attributs : une à la fois
    private final ArrayDeque<Integer> aDemander = new ArrayDeque<>();
    private final Map<Integer, Integer> categories = new HashMap<>();
    private Integer enCours = null;
    private final ByteArrayOutputStream tampon = new ByteArrayOutputStream();
    private final ArrayDeque<byte[]> ecritures = new ArrayDeque<>();
    private boolean ecritureEnCours = false;
    private int etapeActivation = 0;   // 0 = rien, 1 = Data Source activé, 2 = tout activé

    // ---------- Démarrage ----------
    static void demarrer(Context c) {
        Intent i = new Intent(c, PontService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void oublier(Context c) {
        c.getSharedPreferences("pont", MODE_PRIVATE).edit().remove("iphone").apply();
        log("iPhone oublié. Retire aussi « Panneau » dans Réglages > Bluetooth de l'iPhone.");
    }

    static synchronized void log(String s) {
        String t = new SimpleDateFormat("HH:mm:ss", Locale.CANADA_FRENCH).format(new Date());
        JOURNAL.addFirst(t + "  " + s);
        while (JOURNAL.size() > 60) JOURNAL.removeLast();
    }

    static synchronized String journal() {
        StringBuilder b = new StringBuilder();
        for (String s : JOURNAL) b.append(s).append('\n');
        return b.toString();
    }

    private void setEtat(String s) { etat = s; log(s); }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        premierPlan();
        if (!actif) { actif = true; initialiser(); }
        return START_STICKY;
    }

    private void premierPlan() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("pont", "Pont iPhone", NotificationManager.IMPORTANCE_LOW));
            nb = new Notification.Builder(this, "pont");
        } else nb = new Notification.Builder(this);
        PendingIntent pi = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        nb.setContentTitle("Pont iPhone actif").setContentText("Relie ton iPhone au panneau")
          .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth).setContentIntent(pi).setOngoing(true);
        startForeground(1, nb.build());
    }

    private void initialiser() {
        prefs = getSharedPreferences("pont", MODE_PRIVATE);
        bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        ba = bm == null ? null : bm.getAdapter();
        if (ba == null) { setEtat("Pas de Bluetooth sur cet appareil"); return; }
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        f.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        registerReceiver(recepteur, f);
        new Thread(this::boucleCommandes, "commandes").start();
        if (!ba.isEnabled()) { setEtat("Le Bluetooth est éteint : allume-le"); return; }
        demarrerBluetooth();
    }

    private void demarrerBluetooth() {
        ouvrirServeur();
        annoncer();
        reconnecter();
        ecouterAirPods();
    }

    // ---------- AirPods : la tablette capte le signal qu'ils envoient (étui ouvert ou écouteurs sortis) ----------
    private BluetoothLeScanner scanneur;
    private String dernierAirPods = "";
    private long dernierEnvoiAirPods = 0;
    private final ScanCallback rappelScan = new ScanCallback() {
        @Override public void onScanResult(int type, ScanResult r) { airPods(r); }
        @Override public void onScanFailed(int code) { log("Recherche des AirPods impossible (code " + code + ")"); }
    };

    private void ecouterAirPods() {
        try {
            scanneur = ba.getBluetoothLeScanner();
            if (scanneur == null) return;
            try { scanneur.stopScan(rappelScan); } catch (Exception e) { }
            ScanFilter f = new ScanFilter.Builder().setManufacturerData(76, new byte[] { 7, 25 }, new byte[] { (byte) 0xff, (byte) 0xff }).build();
            ScanSettings st = new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build();
            scanneur.startScan(Collections.singletonList(f), st, rappelScan);
            log("Recherche des AirPods active");
        } catch (SecurityException e) {
            log("AirPods : permission de localisation manquante (ouvre l'appli Pont iPhone)");
        } catch (Exception e) { log("AirPods : " + e.getMessage()); }
        // Android coupe parfois les longues recherches : on relance aux 10 minutes
        h.removeCallbacks(relanceScan);
        h.postDelayed(relanceScan, 10 * 60 * 1000);
    }
    private final Runnable relanceScan = this::ecouterAirPods;

    // Format du signal (comme l'appli OpenPods) : 27 octets, piles en demi-octets (0-10 = 0-100 %, 15 = inconnu)
    private void airPods(ScanResult r) {
        if (r.getScanRecord() == null || r.getRssi() < -70) return;      // trop loin : sûrement les AirPods du voisin
        byte[] d = r.getScanRecord().getManufacturerSpecificData(76);
        if (d == null || d.length != 27) return;
        StringBuilder hex = new StringBuilder();
        for (byte x : d) hex.append(String.format("%02x", x));
        String s = hex.toString();
        boolean inverse = (Character.digit(s.charAt(10), 16) & 0x02) == 0;
        int g = Character.digit(s.charAt(inverse ? 12 : 13), 16);
        int dr = Character.digit(s.charAt(inverse ? 13 : 12), 16);
        int etui = Character.digit(s.charAt(15), 16);
        int charge = Character.digit(s.charAt(14), 16);
        boolean chG = (charge & (inverse ? 0b010 : 0b001)) != 0;
        boolean chD = (charge & (inverse ? 0b001 : 0b010)) != 0;
        boolean chE = (charge & 0b100) != 0;
        String modele = s.substring(6, 10);
        String nom = "AirPods";
        if ("0e20".equals(modele)) nom = "AirPods Pro";
        else if ("1420".equals(modele) || "2420".equals(modele)) nom = "AirPods Pro 2";
        else if ("1320".equals(modele)) nom = "AirPods 3";
        else if ("1920".equals(modele) || "1b20".equals(modele)) nom = "AirPods 4";
        else if ("0a20".equals(modele)) nom = "AirPods Max";
        try {
            JSONObject o = new JSONObject();
            o.put("nom", nom);
            if (g <= 10) o.put("gauche", g * 10);
            if (dr <= 10) o.put("droite", dr * 10);
            if (etui <= 10) o.put("etui", etui * 10);
            o.put("chargeGauche", chG); o.put("chargeDroite", chD); o.put("chargeEtui", chE);
            String j = o.toString();
            long now = System.currentTimeMillis();
            if (j.equals(dernierAirPods) && now - dernierEnvoiAirPods < 30000) return;   // pas de changement
            dernierAirPods = j; dernierEnvoiAirPods = now;
            envoyer("airpods", j);
        } catch (Exception e) { }
    }

    // ---------- Côté « périphérique » : l'iPhone se connecte à nous ----------
    private void ouvrirServeur() {
        if (serveur != null) return;
        serveur = bm.openGattServer(this, new BluetoothGattServerCallback() {
            @Override public void onConnectionStateChange(BluetoothDevice d, int status, int newState) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    log("Un appareil s'est connecté : " + d.getAddress());
                    h.post(() -> { if (gatt == null) connecter(d, false); });
                }
            }
            @Override public void onCharacteristicReadRequest(BluetoothDevice d, int id, int off, BluetoothGattCharacteristic c) {
                serveur.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, 0, "Panneau".getBytes(Charset.forName("UTF-8")));
            }
        });
        if (serveur == null) { log("Impossible d'ouvrir le serveur Bluetooth"); return; }
        BluetoothGattService s = new BluetoothGattService(MON_SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
        s.addCharacteristic(new BluetoothGattCharacteristic(MA_CARAC, BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ));
        serveur.addService(s);
    }

    private void annoncer() {
        if (!ba.isMultipleAdvertisementSupported()) {
            log("Cette tablette ne peut pas s'annoncer en Bluetooth LE (mode périphérique non supporté).");
            if (prefs.getString("iphone", null) == null) setEtat("Mode périphérique non supporté par la tablette");
            return;
        }
        annonceur = ba.getBluetoothLeAdvertiser();
        if (annonceur == null) { log("Annonceur indisponible"); return; }
        try { ba.setName("Panneau"); } catch (Exception e) { /* pas grave */ }
        AdvertiseSettings reglages = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setConnectable(true).setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).build();
        AdvertiseData donnees = new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(MON_SERVICE)).build();
        AdvertiseData reponse = new AdvertiseData.Builder().setIncludeDeviceName(true).build();
        annonceur.startAdvertising(reglages, donnees, reponse, new AdvertiseCallback() {
            @Override public void onStartSuccess(AdvertiseSettings s) {
                if (prefs.getString("iphone", null) == null) setEtat("Prêt : connecte l'iPhone à « Panneau »");
                else log("Annonce Bluetooth active");
            }
            @Override public void onStartFailure(int code) { setEtat("Annonce Bluetooth refusée (code " + code + ")"); }
        });
    }

    // ---------- Côté « client » : on lit les notifications de l'iPhone ----------
    private void reconnecter() {
        String adr = prefs.getString("iphone", null);
        if (adr == null || gatt != null) return;
        try {
            BluetoothDevice d = ba.getRemoteDevice(adr);
            setEtat("En attente de l'iPhone…");
            connecter(d, true);
        } catch (Exception e) { log("Adresse invalide : " + e.getMessage()); }
    }

    private void connecter(BluetoothDevice d, boolean auto) {
        if (gatt != null) return;
        if (Build.VERSION.SDK_INT >= 23) gatt = d.connectGatt(this, auto, rappels, BluetoothDevice.TRANSPORT_LE);
        else gatt = d.connectGatt(this, auto, rappels);
    }

    private void fermer() {
        if (gatt != null) { try { gatt.close(); } catch (Exception e) { } gatt = null; }
        etapeActivation = 0; enCours = null; aDemander.clear(); ecritures.clear(); ecritureEnCours = false; tampon.reset();
    }

    private final BluetoothGattCallback rappels = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
            h.post(() -> {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    log("Connecté, recherche des notifications de l'iPhone…");
                    g.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    boolean connu = prefs.getString("iphone", null) != null;
                    setEtat(connu ? "iPhone hors de portée, je réessaie…" : "Déconnecté");
                    envoyer("ancs", "{\"connecte\":false}");
                    fermer();
                    h.postDelayed(PontService.this::reconnecter, 5000);
                }
            });
        }

        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            h.post(() -> {
                BluetoothGattService s = g.getService(ANCS);
                if (s == null) {
                    log("Pas de notifications sur cet appareil (pas un iPhone, ou pas encore jumelé)");
                    if (g.getDevice().getBondState() != BluetoothDevice.BOND_BONDED) { g.getDevice().createBond(); return; }
                    fermer();
                    return;
                }
                prefs.edit().putString("iphone", g.getDevice().getAddress()).apply();
                etapeActivation = 0;
                activer(s.getCharacteristic(DATA_SOURCE));
            });
        }

        @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            h.post(() -> {
                if (status == 5 || status == 15 || status == 137) {   // pas encore jumelé / chiffré
                    log("Jumelage demandé à l'iPhone : accepte sur l'iPhone");
                    if (g.getDevice().getBondState() == BluetoothDevice.BOND_NONE) g.getDevice().createBond();
                    return;   // on réessaie quand le jumelage est fait
                }
                if (status != BluetoothGatt.GATT_SUCCESS) { log("Erreur d'activation (" + status + ")"); return; }
                BluetoothGattService s = g.getService(ANCS);
                if (s == null) return;
                if (DATA_SOURCE.equals(d.getCharacteristic().getUuid())) {
                    etapeActivation = 1;
                    activer(s.getCharacteristic(NOTIF_SOURCE));
                } else {
                    etapeActivation = 2;
                    setEtat("iPhone connecté ✔");
                    envoyer("ancs", "{\"connecte\":true}");
                }
            });
        }

        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            final byte[] v = c.getValue().clone();
            final UUID u = c.getUuid();
            h.post(() -> {
                if (NOTIF_SOURCE.equals(u)) recuNotif(v);
                else if (DATA_SOURCE.equals(u)) recuDonnees(v);
            });
        }

        @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            h.post(() -> { ecritureEnCours = false; ecrireSuivant(); });
        }
    };

    private void activer(BluetoothGattCharacteristic c) {
        if (gatt == null || c == null) return;
        gatt.setCharacteristicNotification(c, true);
        BluetoothGattDescriptor d = c.getDescriptor(CCCD);
        if (d == null) { log("Descripteur manquant"); return; }
        d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
        gatt.writeDescriptor(d);
    }

    private final BroadcastReceiver recepteur = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(i.getAction())) {
                int st = i.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1);
                if (st == BluetoothAdapter.STATE_ON) h.postDelayed(PontService.this::demarrerBluetooth, 1000);
                if (st == BluetoothAdapter.STATE_OFF) { fermer(); serveur = null; setEtat("Le Bluetooth est éteint : allume-le"); }
                return;
            }
            int st = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1);
            if (st == BluetoothDevice.BOND_BONDED && gatt != null) {
                log("Jumelé ✔");
                h.postDelayed(() -> { if (gatt != null) gatt.discoverServices(); }, 1000);
            }
        }
    };

    // ---------- Notifications ----------
    // Notification Source : [événement, drapeaux, catégorie, compte, uid (4 octets)]
    private void recuNotif(byte[] v) {
        if (v.length < 8) return;
        int evt = v[0] & 0xff, cat = v[2] & 0xff;
        int uid = (v[4] & 0xff) | ((v[5] & 0xff) << 8) | ((v[6] & 0xff) << 16) | ((v[7] & 0xff) << 24);
        if (evt == 2) {   // retirée
            categories.remove(uid);
            envoyer("ancs", "{\"evt\":\"retrait\",\"uid\":" + (uid & 0xffffffffL) + "}");
            return;
        }
        categories.put(uid, cat);
        if (!aDemander.contains(uid)) aDemander.add(uid);
        demanderSuivant();
    }

    // Demande titre, sous-titre, texte et appli d'une notification
    private void demanderSuivant() {
        if (enCours != null || aDemander.isEmpty()) return;
        enCours = aDemander.poll();
        tampon.reset();
        int u = enCours;
        byte[] cmd = { 0, (byte) u, (byte) (u >> 8), (byte) (u >> 16), (byte) (u >> 24),
            0,                       // identifiant de l'appli
            1, (byte) 64, 0,         // titre (64 car.)
            2, (byte) 64, 0,         // sous-titre
            3, (byte) 255, 0 };      // message (255 car.)
        ecrire(cmd);
        final Integer attendu = enCours;
        h.postDelayed(() -> { if (attendu.equals(enCours)) { enCours = null; demanderSuivant(); } }, 4000);
    }

    // Data Source : [0, uid(4), puis pour chaque attribut : id(1) longueur(2) valeur]
    private void recuDonnees(byte[] v) {
        if (enCours == null) return;
        tampon.write(v, 0, v.length);
        byte[] b = tampon.toByteArray();
        if (b.length < 5) return;
        String[] vals = new String[4];
        int p = 5;
        for (int n = 0; n < 4; n++) {
            if (p + 3 > b.length) return;                 // il en manque, on attend
            int id = b[p] & 0xff, len = (b[p + 1] & 0xff) | ((b[p + 2] & 0xff) << 8);
            if (p + 3 + len > b.length) return;
            if (id < 4) vals[id] = new String(b, p + 3, len, Charset.forName("UTF-8"));
            p += 3 + len;
        }
        int uid = enCours;
        Integer cat = categories.get(uid);
        enCours = null;
        try {
            JSONObject o = new JSONObject();
            o.put("evt", "ajout");
            o.put("uid", uid & 0xffffffffL);
            o.put("appId", vals[0] == null ? "" : vals[0]);
            o.put("titre", vals[1] == null ? "" : vals[1]);
            o.put("sousTitre", vals[2] == null ? "" : vals[2]);
            o.put("texte", vals[3] == null ? "" : vals[3]);
            o.put("categorie", cat != null && cat == 1 ? "appel" : String.valueOf(cat));
            o.put("heure", new SimpleDateFormat("HH:mm", Locale.CANADA_FRENCH).format(new Date()));
            envoyer("ancs", o.toString());
            if (cat != null && cat == 1) log("Appel entrant : " + vals[1]);
        } catch (Exception e) { log("Erreur : " + e.getMessage()); }
        demanderSuivant();
    }

    // Accepter (0) ou refuser (1) une notification (ex. un appel)
    private void action(long uid, boolean positive) {
        int u = (int) uid;
        ecrire(new byte[] { 2, (byte) u, (byte) (u >> 8), (byte) (u >> 16), (byte) (u >> 24), (byte) (positive ? 0 : 1) });
        log(positive ? "Appel accepté" : "Appel refusé");
    }

    private void ecrire(byte[] data) { ecritures.add(data); ecrireSuivant(); }

    private void ecrireSuivant() {
        if (ecritureEnCours || ecritures.isEmpty() || gatt == null || etapeActivation < 2) return;
        BluetoothGattService s = gatt.getService(ANCS);
        if (s == null) return;
        BluetoothGattCharacteristic cp = s.getCharacteristic(CONTROL_POINT);
        cp.setValue(ecritures.poll());
        cp.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
        ecritureEnCours = gatt.writeCharacteristic(cp);
        if (!ecritureEnCours) h.postDelayed(this::ecrireSuivant, 300);
    }

    // ---------- Échanges avec le panneau ----------
    private void envoyer(String action, String json) {
        new Thread(() -> poster(action, json)).start();
    }

    private static String poster(String action, String json) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(PANNEAU + action).openConnection();
            c.setConnectTimeout(3000); c.setReadTimeout(5000);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            OutputStream os = c.getOutputStream();
            os.write(json.getBytes(Charset.forName("UTF-8"))); os.close();
            InputStream is = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[4096]; int n;
            while ((n = is.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return null;   // panneau pas encore lancé : pas grave
        } finally { if (c != null) c.disconnect(); }
    }

    // Va chercher chaque seconde les commandes du panneau (accepter / refuser un appel)
    private void boucleCommandes() {
        while (actif) {
            try {
                Thread.sleep(1000);
                if (etapeActivation < 2) continue;
                String r = poster("commandes", "{}");
                if (r == null) continue;
                JSONArray l = new JSONObject(r).optJSONArray("result");
                if (l == null) continue;
                for (int i = 0; i < l.length(); i++) {
                    JSONObject o = l.getJSONObject(i);
                    final long uid = o.getLong("uid");
                    final boolean pos = "positive".equals(o.optString("action"));
                    h.post(() -> action(uid, pos));
                }
            } catch (Exception e) { /* on continue */ }
        }
    }

    @Override public void onDestroy() {
        actif = false;
        try { unregisterReceiver(recepteur); } catch (Exception e) { }
        fermer();
        try { if (scanneur != null) scanneur.stopScan(rappelScan); } catch (Exception e) { }
        if (serveur != null) serveur.close();
        super.onDestroy();
    }
}
