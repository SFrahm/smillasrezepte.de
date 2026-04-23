let recipes = [];
let filteredRecipes = [];

async function loadRecipes() {
    const response = await fetch('data.json');
    const data = await response.json();
    recipes = data.recipes;
    filteredRecipes = [...recipes];
    displayRecipes(filteredRecipes);
    displayForYou();
}

function displayRecipes(recipesToDisplay) {
    const container = document.getElementById('recipe-list');
    container.innerHTML = '';
    recipesToDisplay.forEach(recipe => {
        const recipeEl = document.createElement('div');
        recipeEl.className = 'recipe-detail';
        recipeEl.innerHTML = `
            <h3>${recipe.name}</h3>
            <img src="${recipe.image}" alt="${recipe.name}" style="max-width: 300px;">
            <p><strong>Beschreibung:</strong> ${recipe.description}</p>
            <p><strong>Zutaten:</strong> ${recipe.ingredients.join(', ')}</p>
            <p><strong>Zubereitung:</strong> ${recipe.instructions}</p>
            <p><strong>Kalorien:</strong> ${recipe.calories} | <strong>Protein:</strong> ${recipe.protein}g</p>
            <p><strong>Kategorie:</strong> ${recipe.category} | <strong>Mahlzeit:</strong> ${Array.isArray(recipe.meal) ? recipe.meal.join(', ') : recipe.meal} | <strong>Größe:</strong> ${recipe.size}</p>
        `;
        container.appendChild(recipeEl);
    });
}

function displayForYou() {
    const container = document.getElementById('for-you-recipes');
    container.innerHTML = '';
    recipes.forEach(recipe => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.innerHTML = `
            <img src="${recipe.image}" alt="${recipe.name}">
            <h3>${recipe.name}</h3>
            <p>${recipe.description}</p>
        `;
        card.addEventListener('click', () => showRecipeDetail(recipe));
        container.appendChild(card);
    });
}

function showRecipeDetail(recipe) {
    const params = new URLSearchParams({
        name: recipe.name,
        image: recipe.image,
        description: recipe.description,
        ingredients: recipe.ingredients.join(','),
        instructions: recipe.instructions,
        calories: recipe.calories,
        protein: recipe.protein,
        category: recipe.category,
        meal: JSON.stringify(recipe.meal),
        size: recipe.size
    });
    window.open(`recipe.html?${params.toString()}`, '_blank');
}

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
    document.getElementById('add-recipe-overlay').style.display = 'block';
});

document.getElementById('save-recipe').addEventListener('click', saveRecipe);
document.getElementById('cancel-recipe').addEventListener('click', () => {
    document.getElementById('add-recipe-overlay').style.display = 'none';
});

// Schließe Modal bei Klick auf Overlay
document.getElementById('add-recipe-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'add-recipe-overlay') {
        document.getElementById('add-recipe-overlay').style.display = 'none';
    }
});

function saveRecipe() {
    const name = document.getElementById('recipe-name').value;
    const image = document.getElementById('recipe-image').value;
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
    displayRecipes(filteredRecipes);
    displayForYou();
    document.getElementById('add-recipe-overlay').style.display = 'none';
    // In Realität würde man das in data.json speichern, aber für Demo reicht das.
}

loadRecipes();