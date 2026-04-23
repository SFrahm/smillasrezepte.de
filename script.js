let recipes = [];
let filteredRecipes = [];
let selectedImageDataUrl = '';

async function loadRecipes() {
    try {
        const snapshot = await db.ref('recipes').get();
        if (snapshot.exists() && snapshot.val() && snapshot.val().length > 0) {
            recipes = snapshot.val();
        } else {
            // Erster Start: Standardrezepte aus data.json in Firebase laden
            const response = await fetch('data.json');
            const data = await response.json();
            recipes = data.recipes;
            await db.ref('recipes').set(recipes);
        }
    } catch (e) {
        // Fallback falls Firebase noch nicht konfiguriert ist
        const response = await fetch('data.json');
        const data = await response.json();
        recipes = data.recipes;
    }
    filteredRecipes = [...recipes];
    displayRecipes(filteredRecipes);
}

function displayRecipes(recipesToDisplay) {
    const container = document.getElementById('recipes-grid');
    container.innerHTML = '';
    recipesToDisplay.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
            <img src="${recipe.image}" alt="${recipe.name}">
            <h3>${recipe.name}</h3>
        `;
        card.addEventListener('click', () => showRecipeDetail(recipe));
        container.appendChild(card);
    });
}

function showRecipeDetail(recipe) {
    const content = document.getElementById('recipe-detail-content');
    content.innerHTML = `
        <img src="${recipe.image}" alt="${recipe.name}">
        <h2>${recipe.name}</h2>
        <p class="detail-description">${recipe.description}</p>
        <div class="detail-meta">
            <span>${recipe.calories} kcal</span>
            <span>${recipe.protein}g Protein</span>
            <span>${recipe.category}</span>
            <span>${Array.isArray(recipe.meal) ? recipe.meal.join(', ') : recipe.meal}</span>
            <span>${recipe.size}</span>
        </div>
        <h4>Zutaten</h4>
        <ul>${recipe.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
        <h4>Zubereitung</h4>
        <p>${recipe.instructions}</p>
    `;
    document.getElementById('recipe-detail-overlay').style.display = 'flex';
}

document.getElementById('close-detail').addEventListener('click', () => {
    document.getElementById('recipe-detail-overlay').style.display = 'none';
});
document.getElementById('recipe-detail-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'recipe-detail-overlay') {
        document.getElementById('recipe-detail-overlay').style.display = 'none';
    }
});

document.getElementById('search-input').addEventListener('input', filterRecipes);
document.getElementById('filter-btn').addEventListener('click', () => {
    document.getElementById('filter-overlay').style.display = 'block';
});

document.getElementById('apply-filters').addEventListener('click', applyFilters);
document.getElementById('close-filter').addEventListener('click', () => {
    document.getElementById('filter-overlay').style.display = 'none';
});

document.getElementById('filter-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'filter-overlay') {
        document.getElementById('filter-overlay').style.display = 'none';
    }
});

function filterRecipes() {
    const query = document.getElementById('search-input').value.toLowerCase();
    filteredRecipes = recipes.filter(recipe =>
        recipe.name.toLowerCase().includes(query) ||
        recipe.description.toLowerCase().includes(query) ||
        recipe.ingredients.some(ing => ing.toLowerCase().includes(query))
    );
    displayRecipes(filteredRecipes);
}

function applyFilters() {
    const minCalories = parseInt(document.getElementById('min-calories').value) || 0;
    const maxCalories = parseInt(document.getElementById('max-calories').value) || Infinity;
    const minProtein = parseInt(document.getElementById('min-protein').value) || 0;
    const maxProtein = parseInt(document.getElementById('max-protein').value) || Infinity;
    const selectedCategories = Array.from(document.querySelectorAll('.category-filter:checked')).map(cb => cb.value);
    const selectedMeals = Array.from(document.querySelectorAll('.meal-filter:checked')).map(cb => cb.value);
    const selectedSizes = Array.from(document.querySelectorAll('.size-filter:checked')).map(cb => cb.value);
    const ingredients = document.getElementById('ingredients-input').value.toLowerCase().split(',').map(i => i.trim()).filter(i => i);

    filteredRecipes = recipes.filter(recipe => {
        return recipe.calories >= minCalories && recipe.calories <= maxCalories &&
               recipe.protein >= minProtein && recipe.protein <= maxProtein &&
               (selectedCategories.length === 0 || selectedCategories.includes(recipe.category)) &&
               (selectedMeals.length === 0 || selectedMeals.some(m => recipe.meal.includes(m))) &&
               (selectedSizes.length === 0 || selectedSizes.includes(recipe.size)) &&
               (ingredients.length === 0 || ingredients.every(ing => recipe.tags.some(tag => tag.toLowerCase().includes(ing))));
    });
    displayRecipes(filteredRecipes);
    document.getElementById('filter-popup').style.display = 'none';
}

document.getElementById('add-recipe-btn').addEventListener('click', () => {
    document.getElementById('add-recipe-overlay').style.display = 'flex';
});

document.getElementById('recipe-image').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        selectedImageDataUrl = e.target.result;
        const preview = document.getElementById('recipe-image-preview');
        preview.src = selectedImageDataUrl;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
});

document.getElementById('save-recipe').addEventListener('click', saveRecipe);
document.getElementById('cancel-recipe').addEventListener('click', () => {
    document.getElementById('add-recipe-overlay').style.display = 'none';
    resetForm();
});

// Schließe Modal bei Klick auf Overlay
document.getElementById('add-recipe-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'add-recipe-overlay') {
        document.getElementById('add-recipe-overlay').style.display = 'none';
    }
});

async function saveRecipe() {
    const name = document.getElementById('recipe-name').value;
    const image = selectedImageDataUrl;
    const description = document.getElementById('recipe-description').value;
    const ingredients = document.getElementById('recipe-ingredients').value.split(',');
    const instructions = document.getElementById('recipe-instructions').value;
    const calories = parseInt(document.getElementById('recipe-calories').value);
    const protein = parseInt(document.getElementById('recipe-protein').value);
    const category = document.getElementById('recipe-category').value;
    const meal = Array.from(document.querySelectorAll('.meal-checkbox:checked')).map(cb => cb.value);
    const size = document.getElementById('recipe-size').value;
    const tags = document.getElementById('recipe-tags').value.split(',');

    if (!name || !image || !description || !instructions || !calories || !protein || !category || meal.length === 0 || !size) {
        alert('Bitte alle erforderlichen Felder ausfüllen und mindestens eine Mahlzeit auswählen!');
        return;
    }

    const newRecipe = {
        id: recipes.length + 1,
        name,
        image,
        description,
        ingredients: ingredients.map(i => i.trim()),
        instructions,
        calories,
        protein,
        category,
        meal,
        size,
        tags: tags.map(t => t.trim())
    };

    recipes.push(newRecipe);
    filteredRecipes = [...recipes];
    try {
        await db.ref('recipes').set(recipes);
    } catch (e) {
        console.error('Firebase-Speichern fehlgeschlagen:', e);
    }
    displayRecipes(filteredRecipes);
    document.getElementById('add-recipe-overlay').style.display = 'none';
    resetForm();
    // In Realität würde man das in data.json speichern, aber für Demo reicht das.
}

function resetForm() {
    selectedImageDataUrl = '';
    document.getElementById('add-recipe-form').reset();
    const preview = document.getElementById('recipe-image-preview');
    preview.src = '';
    preview.style.display = 'none';
}

// Sicherstellen dass Overlay und Formular beim Start sauber sind
document.getElementById('add-recipe-overlay').style.display = 'none';
resetForm();

loadRecipes();