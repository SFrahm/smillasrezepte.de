const firebaseConfig = {
    apiKey: "AIzaSyDqF4_VD6mNtKRnyOsXx9AWVEuz5_t7Ku8",
    authDomain: "smillasrezepte.firebaseapp.com",
    databaseURL: "HIER_DEINE_DATENBANK_URL_EINTRAGEN",
    projectId: "smillasrezepte",
    storageBucket: "smillasrezepte.firebasestorage.app",
    messagingSenderId: "704695074345",
    appId: "1:704695074345:web:537776f344cd2c365c6638"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
