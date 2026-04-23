const firebaseConfig = {
    apiKey: "AIzaSyDqF4_VD6mNtKRnyOsXx9AWVEuz5_t7Ku8",
    authDomain: "smillasrezepte.firebaseapp.com",
    databaseURL: "https://smillasrezepte-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "smillasrezepte",
    storageBucket: "smillasrezepte.firebasestorage.app",
    messagingSenderId: "704695074345",
    appId: "1:704695074345:web:ead19238d9b2701a5c6638",
    measurementId: "G-KPPST35BTY"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
