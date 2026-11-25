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
 * Pont Bluetooth entre les iPhone et le panneau (autant d'iPhone que tu veux).
 * La tablette agit comme une montre : elle lit les notifications de l'iPhone (ANCS d'Apple)
 * et les envoie au panneau (http://127.0.0.1:8080). Elle peut aussi accepter / refuser un appel.
 */
public class PontService extends Service {
    // Service ANCS d'Apple
    static final UUID ANCS = UUID.fromString("7905F431-B5CE-4E99-A40F-4B1E122D00D0");
    static final UUID NOTIF_SOURCE = UUID.fromString("9FBF120D-6301-42D9-8C58-25E699A21DBD");
    static final UUID CONTROL_POINT = UUID.fromString("69D1D8F3-45E1-49A8-9821-9BBDFDAAD9D9");
    static final UUID DATA_SOURCE = UUID.fromString("22EAC6E9-24D6-4BB5-BE44-B36ACE7C7BFB");
    static final UUID BATTERIE = UUID.fromString("0000180f-0000-1000-8000-00805f9b34fb");
    static final UUID NIVEAU = UUID.fromString("00002a19-0000-1000-8000-00805f9b34fb");
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
    private SharedPreferences prefs;
    private volatile boolean actif = false;

    // Un « lien » par iPhone connu, par adresse Bluetooth
    private final Map<String, Lien> liens = new HashMap<>();

    // ---------- Démarrage ----------
    static void demarrer(Context c) {
        Intent i = new Intent(c, PontService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void oublier(Context c) {
        c.getSharedPreferences("pont", MODE_PRIVATE).edit().clear().apply();
        log("iPhone oubliés. Retire aussi « Panneau » dans Réglages > Bluetooth de chaque iPhone.");
    }

    static synchronized void log(String s) {
        String t = new SimpleDateFormat("HH:mm:ss", Locale.CANADA_FRENCH).format(new Date());
        JOURNAL.addFirst(t + "  " + s);
        while (JOURNAL.size() > 80) JOURNAL.removeLast();
    }

    static synchronized String journal() {
        StringBuilder b = new StringBuilder();
        for (String s : JOURNAL) b.append(s).append('\n');
        return b.toString();
    }

    private void majEtat() {
        int n = 0;
        StringBuilder noms = new StringBuilder();
        for (Lien l : liens.values()) if (l.pret()) { n++; noms.append(noms.length() > 0 ? ", " : "").append(l.qui); }
        etat = n == 0 ? (liens.isEmpty() ? "Prêt : connecte un iPhone à « Panneau »" : "En attente des iPhone…")
                      : (n == 1 ? "iPhone connecté ✔ (" + noms + ")" : n + " iPhone connectés ✔ (" + noms + ")");
    }

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
        nb.setContentTitle("Pont iPhone actif").setContentText("Relie tes iPhone au panneau")
          .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth).setContentIntent(pi).setOngoing(true);
        startForeground(1, nb.build());
    }

    private void initialiser() {
        prefs = getSharedPreferences("pont", MODE_PRIVATE);
        bm = (BluetoothManager) getSystemService(BLUETOOTH_SERVICE);
        ba = bm == null ? null : bm.getAdapter();
        if (ba == null) { etat = "Pas de Bluetooth sur cet appareil"; log(etat); return; }
        IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED);
        f.addAction(BluetoothAdapter.ACTION_STATE_CHANGED);
        registerReceiver(recepteur, f);
        new Thread(this::boucleCommandes, "commandes").start();
        if (!ba.isEnabled()) { etat = "Le Bluetooth est éteint : allume-le"; log(etat); return; }
        demarrerBluetooth();
    }

    private void demarrerBluetooth() {
        ouvrirServeur();
        annoncer();
        // Les iPhone déjà connus : l'ancien réglage « iphone » (version 1) + la liste « connus »
        String ancien = prefs.getString("iphone", null);
        if (ancien != null) lien(ancien, true);
        for (String adr : prefs.getStringSet("connus", Collections.<String>emptySet())) lien(adr, false);
        majEtat();
    }

    private Lien lien(String adresse, boolean ancien) {
        adresse = adresse.toUpperCase(Locale.ROOT);
        Lien l = liens.get(adresse);
        if (l == null) {
            l = new Lien(adresse, ancien || adresse.equals(prefs.getString("iphone", "")));
            liens.put(adresse, l);
            l.connecter(true);
        }
        return l;
    }

    private void retenir(String adresse) {
        java.util.Set<String> s = new java.util.HashSet<>(prefs.getStringSet("connus", Collections.<String>emptySet()));
        if (s.add(adresse)) prefs.edit().putStringSet("connus", s).apply();
    }

    // ---------- Côté « périphérique » : les iPhone se connectent à nous ----------
    private void ouvrirServeur() {
        if (serveur != null) return;
        serveur = bm.openGattServer(this, new BluetoothGattServerCallback() {
            @Override public void onConnectionStateChange(BluetoothDevice d, int status, int newState) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    log("Un appareil s'est connecté : " + d.getAddress());
                    h.post(() -> {
                        Lien l = lien(d.getAddress(), false);
                        // L'iPhone est là : si notre lien vers lui n'est pas encore établi, on abandonne
                        // l'attente automatique (lente) et on se connecte directement tout de suite
                        if (!l.relie) { l.fermer(); l.connecter(false); }
                    });
                    // On continue de s'annoncer pour qu'un autre iPhone puisse aussi se connecter
                    h.postDelayed(PontService.this::annoncer, 1500);
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

    private final AdvertiseCallback rappelAnnonce = new AdvertiseCallback() {
        @Override public void onStartSuccess(AdvertiseSettings s) { log("Annonce Bluetooth active"); }
        @Override public void onStartFailure(int code) { if (code != ADVERTISE_FAILED_ALREADY_STARTED) log("Annonce Bluetooth refusée (code " + code + ")"); }
    };

    private void annoncer() {
        if (!ba.isMultipleAdvertisementSupported()) {
            log("Cette tablette ne peut pas s'annoncer en Bluetooth LE (mode périphérique non supporté).");
            return;
        }
        annonceur = ba.getBluetoothLeAdvertiser();
        if (annonceur == null) { log("Annonceur indisponible"); return; }
        try { ba.setName("Panneau"); } catch (Exception e) { /* pas grave */ }
        try { annonceur.stopAdvertising(rappelAnnonce); } catch (Exception e) { }
        AdvertiseSettings reglages = new AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setConnectable(true).setTimeout(0)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM).build();
        AdvertiseData donnees = new AdvertiseData.Builder().addServiceUuid(new ParcelUuid(MON_SERVICE)).build();
        AdvertiseData reponse = new AdvertiseData.Builder().setIncludeDeviceName(true).build();
        annonceur.startAdvertising(reglages, donnees, reponse, rappelAnnonce);
    }

    // ---------- Côté « client » : un lien par iPhone, qui lit ses notifications ----------
    private class Lien {
        final String adresse;
        final boolean ancien;            // ton premier iPhone (version 1 de l'appli) = « iphone » dans le panneau
        String qui = null;               // id dans le panneau (iphone, iphone16, …)
        BluetoothGatt gatt;
        final ArrayDeque<Integer> aDemander = new ArrayDeque<>();
        final Map<Integer, Integer> categories = new HashMap<>();
        Integer enCours = null;
        final ByteArrayOutputStream tampon = new ByteArrayOutputStream();
        final ArrayDeque<byte[]> ecritures = new ArrayDeque<>();
        boolean ecritureEnCours = false;
        int etape = 0;                   // 0 = rien, 1 = Data Source activé, 2 = tout activé
        int dernierePile = -1;
        boolean relie = false;           // connexion client établie

        Lien(String adresse, boolean ancien) { this.adresse = adresse; this.ancien = ancien; }

        boolean pret() { return etape >= 2 && qui != null; }
        String nom() { return qui != null ? qui : adresse.substring(adresse.length() - 5); }

        void connecter(boolean auto) {
            if (gatt != null) return;
            try {
                BluetoothDevice d = ba.getRemoteDevice(adresse);
                if (Build.VERSION.SDK_INT >= 23) gatt = d.connectGatt(PontService.this, auto, rappels, BluetoothDevice.TRANSPORT_LE);
                else gatt = d.connectGatt(PontService.this, auto, rappels);
            } catch (Exception e) { log("Adresse invalide : " + e.getMessage()); }
        }

        void fermer() {
            if (gatt != null) { try { gatt.close(); } catch (Exception e) { } gatt = null; }
            relie = false; etape = 0; enCours = null; aDemander.clear(); ecritures.clear(); ecritureEnCours = false; tampon.reset();
        }

        // Envoie au panneau en disant de quel iPhone il s'agit
        void envoyer(JSONObject o) {
            if (qui == null) return;
            try { o.put("qui", qui); } catch (Exception e) { }
            PontService.this.envoyer("ancs", o.toString());
        }

        // Demande au panneau quel appareil c'est (une fois)
        void identifier(Runnable ensuite) {
            if (qui != null) { ensuite.run(); return; }
            new Thread(() -> {
                String r = poster("lier", "{\"adresse\":\"" + adresse + "\",\"ancien\":" + ancien + "}");
                String id = null;
                try { id = new JSONObject(r).optString("result", null); } catch (Exception e) { }
                final String fid = id;
                h.post(() -> {
                    if (fid == null || fid.isEmpty()) { log("Panneau injoignable, je réessaie…"); h.postDelayed(() -> identifier(ensuite), 5000); return; }
                    qui = fid; log("iPhone " + adresse + " = « " + qui + " » dans le panneau");
                    ensuite.run();
                });
            }).start();
        }

        final BluetoothGattCallback rappels = new BluetoothGattCallback() {
            @Override public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
                h.post(() -> {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        relie = true;
                        log(nom() + " : connecté, recherche des notifications…");
                        // Petite pause : sur Android 6, chercher tout de suite après une reconnexion bloque parfois
                        h.postDelayed(() -> { if (gatt == g) g.discoverServices(); }, 800);
                        // Chien de garde : si ce n'est pas prêt dans 25 s, on recommence au complet
                        h.postDelayed(() -> {
                            if (gatt == g && !pret()) {
                                log(nom() + " : bloqué, je reconnecte…");
                                fermer(); majEtat();
                                connecter(false);
                            }
                        }, 25000);
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        log(nom() + " : hors de portée, je réessaie…");
                        try { envoyer(new JSONObject().put("connecte", false)); } catch (Exception e) { }
                        fermer(); majEtat();
                        h.postDelayed(() -> connecter(true), 5000);
                    }
                });
            }

            @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
                h.post(() -> {
                    BluetoothGattService s = g.getService(ANCS);
                    if (s == null) {
                        log("Pas de notifications sur cet appareil (pas un iPhone, ou pas encore jumelé)");
                        if (g.getDevice().getBondState() != BluetoothDevice.BOND_BONDED) { g.getDevice().createBond(); return; }
                        fermer(); liens.remove(adresse);
                        return;
                    }
                    retenir(adresse);
                    identifier(() -> { etape = 0; activer(s.getCharacteristic(DATA_SOURCE)); });
                });
            }

            @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
                h.post(() -> {
                    if (status == 5 || status == 15 || status == 137) {   // pas encore jumelé / chiffré
                        log(nom() + " : jumelage demandé, accepte sur l'iPhone");
                        if (g.getDevice().getBondState() == BluetoothDevice.BOND_NONE) g.getDevice().createBond();
                        return;
                    }
                    if (NIVEAU.equals(d.getCharacteristic().getUuid())) { g.readCharacteristic(d.getCharacteristic()); return; }
                    if (status != BluetoothGatt.GATT_SUCCESS) { log(nom() + " : erreur d'activation (" + status + ")"); return; }
                    BluetoothGattService s = g.getService(ANCS);
                    if (s == null) return;
                    if (DATA_SOURCE.equals(d.getCharacteristic().getUuid())) {
                        etape = 1;
                        activer(s.getCharacteristic(NOTIF_SOURCE));
                    } else {
                        etape = 2;
                        log(qui + " : connecté ✔");
                        majEtat();
                        try { envoyer(new JSONObject().put("connecte", true)); } catch (Exception e) { }
                        BluetoothGattService b = g.getService(BATTERIE);
                        if (b != null && b.getCharacteristic(NIVEAU) != null) activer(b.getCharacteristic(NIVEAU));
                        ecrireSuivant();
                    }
                });
            }

            @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
                final byte[] v = c.getValue().clone();
                final UUID u = c.getUuid();
                h.post(() -> {
                    if (NIVEAU.equals(u)) recuPile(v);
                    else if (NOTIF_SOURCE.equals(u)) recuNotif(v);
                    else if (DATA_SOURCE.equals(u)) recuDonnees(v);
                });
            }

            @Override public void onCharacteristicRead(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
                final byte[] v = c.getValue() == null ? new byte[0] : c.getValue().clone();
                if (status == BluetoothGatt.GATT_SUCCESS && NIVEAU.equals(c.getUuid())) h.post(() -> recuPile(v));
            }

            @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
                h.post(() -> { ecritureEnCours = false; ecrireSuivant(); });
            }
        };

        void activer(BluetoothGattCharacteristic c) {
            if (gatt == null || c == null) return;
            gatt.setCharacteristicNotification(c, true);
            BluetoothGattDescriptor d = c.getDescriptor(CCCD);
            if (d == null) { log("Descripteur manquant"); return; }
            d.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
            gatt.writeDescriptor(d);
        }

        void recuPile(byte[] v) {
            if (v.length < 1) return;
            int p = v[0] & 0xff;
            if (p > 100 || p == dernierePile) return;
            dernierePile = p;
            log(qui + " : pile " + p + " %");
            try { envoyer(new JSONObject().put("batterie", p)); } catch (Exception e) { }
        }

        // Notification Source : [événement, drapeaux, catégorie, compte, uid (4 octets)]
        void recuNotif(byte[] v) {
            if (v.length < 8) return;
            int evt = v[0] & 0xff, cat = v[2] & 0xff;
            int uid = (v[4] & 0xff) | ((v[5] & 0xff) << 8) | ((v[6] & 0xff) << 16) | ((v[7] & 0xff) << 24);
            if (evt == 2) {   // retirée
                categories.remove(uid);
                try { envoyer(new JSONObject().put("evt", "retrait").put("uid", uid & 0xffffffffL)); } catch (Exception e) { }
                return;
            }
            categories.put(uid, cat);
            if (!aDemander.contains(uid)) aDemander.add(uid);
            demanderSuivant();
        }

        // Demande titre, sous-titre, texte et appli d'une notification
        void demanderSuivant() {
            if (enCours != null || aDemander.isEmpty()) return;
            enCours = aDemander.poll();
            tampon.reset();
            int u = enCours;
            byte[] cmd = { 0, (byte) u, (byte) (u >> 8), (byte) (u >> 16), (byte) (u >> 24),
                0, 1, (byte) 64, 0, 2, (byte) 64, 0, 3, (byte) 255, 0 };
            ecrire(cmd);
            final Integer attendu = enCours;
            h.postDelayed(() -> { if (attendu.equals(enCours)) { enCours = null; demanderSuivant(); } }, 4000);
        }

        // Data Source : [0, uid(4), puis pour chaque attribut : id(1) longueur(2) valeur]
        void recuDonnees(byte[] v) {
            if (enCours == null) return;
            tampon.write(v, 0, v.length);
            byte[] b = tampon.toByteArray();
            if (b.length < 5) return;
            String[] vals = new String[4];
            int p = 5;
            for (int n = 0; n < 4; n++) {
                if (p + 3 > b.length) return;
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
                envoyer(o);
                if (cat != null && cat == 1) log(qui + " : appel entrant de " + vals[1]);
            } catch (Exception e) { log("Erreur : " + e.getMessage()); }
            demanderSuivant();
        }

        // Accepter (0) ou refuser (1) une notification (ex. un appel)
        void action(long uid, boolean positive) {
            int u = (int) uid;
            ecrire(new byte[] { 2, (byte) u, (byte) (u >> 8), (byte) (u >> 16), (byte) (u >> 24), (byte) (positive ? 0 : 1) });
            log(qui + " : " + (positive ? "appel accepté" : "appel refusé"));
        }

        void ecrire(byte[] data) { ecritures.add(data); ecrireSuivant(); }

        void ecrireSuivant() {
            if (ecritureEnCours || ecritures.isEmpty() || gatt == null || etape < 2) return;
            BluetoothGattService s = gatt.getService(ANCS);
            if (s == null) return;
            BluetoothGattCharacteristic cp = s.getCharacteristic(CONTROL_POINT);
            cp.setValue(ecritures.poll());
            cp.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            ecritureEnCours = gatt.writeCharacteristic(cp);
            if (!ecritureEnCours) h.postDelayed(this::ecrireSuivant, 300);
        }
    }

    private final BroadcastReceiver recepteur = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(i.getAction())) {
                int st = i.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1);
                if (st == BluetoothAdapter.STATE_ON) h.postDelayed(PontService.this::demarrerBluetooth, 1000);
                if (st == BluetoothAdapter.STATE_OFF) {
                    for (Lien l : liens.values()) l.fermer();
                    liens.clear(); serveur = null;
                    etat = "Le Bluetooth est éteint : allume-le"; log(etat);
                }
                return;
            }
            int st = i.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, -1);
            BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
            if (st == BluetoothDevice.BOND_BONDED && d != null) {
                final Lien l = liens.get(d.getAddress().toUpperCase(Locale.ROOT));
                if (l != null && l.gatt != null) {
                    log("Jumelé ✔");
                    h.postDelayed(() -> { if (l.gatt != null) l.gatt.discoverServices(); }, 1000);
                }
            }
        }
    };

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

    // Va chercher chaque seconde les commandes du panneau (accepter / refuser un appel) et les donne au bon iPhone
    private volatile String prets = "[]";
    private void boucleCommandes() {
        while (actif) {
            try {
                Thread.sleep(1000);
                h.post(() -> {
                    JSONArray a = new JSONArray();
                    for (Lien l : liens.values()) if (l.pret()) a.put(l.qui);
                    prets = a.toString();
                });
                // Chaque seconde : dit au panneau quels iPhone sont reliés, et ramasse les commandes
                String r = poster("commandes", "{\"prets\":" + prets + "}");
                if (r == null) continue;
                JSONArray l = new JSONObject(r).optJSONArray("result");
                if (l == null) continue;
                for (int i = 0; i < l.length(); i++) {
                    JSONObject o = l.getJSONObject(i);
                    final long uid = o.getLong("uid");
                    final boolean pos = "positive".equals(o.optString("action"));
                    final String qui = o.optString("qui", "iphone");
                    h.post(() -> {
                        for (Lien x : liens.values()) if (qui.equals(x.qui)) { x.action(uid, pos); return; }
                        log("Commande pour « " + qui + " » : iPhone pas connecté");
                    });
                }
            } catch (Exception e) { /* on continue */ }
        }
    }

    @Override public void onDestroy() {
        actif = false;
        try { unregisterReceiver(recepteur); } catch (Exception e) { }
        for (Lien l : liens.values()) l.fermer();
        if (serveur != null) serveur.close();
        super.onDestroy();
    }
}
