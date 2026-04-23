// Firebase-Konfiguration hier eintragen (siehe README / Anleitung unten)
const firebaseConfig = {
    apiKey: "DEIN_API_KEY",
    authDomain: "DEIN_PROJEKT.firebaseapp.com",
    databaseURL: "https://DEIN_PROJEKT-default-rtdb.firebaseio.com",
    projectId: "DEIN_PROJEKT",
    storageBucket: "DEIN_PROJEKT.appspot.com",
    messagingSenderId: "DEINE_SENDER_ID",
    appId: "DEINE_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
