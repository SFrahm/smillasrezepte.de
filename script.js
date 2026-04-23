let recipes = [];
let filteredRecipes = [];
let trash = [];
let selectedImageDataUrl = '';

const TRASH_TTL = 5 * 24 * 60 * 60 * 1000;

function saveToLocalStorage() {
    localStorage.setItem('smillas-recipes', JSON.stringify(recipes));
}

function saveTrash() {
    localStorage.setItem('smillas-trash', JSON.stringify(trash));
    try { db.ref('trash').set(trash).catch(() => {}); } catch(e) {}
}

function cleanupTrash() {
    const before = trash.length;
    trash = trash.filter(r => Date.now() - r.deletedAt < TRASH_TTL);
    if (trash.length !== before) saveTrash();
}

function deleteRecipe(recipe) {
    recipes = recipes.filter(r => r.id !== recipe.id);
    filteredRecipes = filteredRecipes.filter(r => r.id !== recipe.id);
    trash.push({ ...recipe, deletedAt: Date.now() });
    saveToLocalStorage();
    saveTrash();
    try { db.ref('recipes').set(recipes).catch(() => {}); } catch(e) {}
    displayRecipes(filteredRecipes);
}

function restoreRecipe(recipe) {
    trash = trash.filter(r => r.id !== recipe.id);
    const { deletedAt, ...clean } = recipe;
    recipes.push(clean);
    filteredRecipes = [...recipes];
    saveToLocalStorage();
    saveTrash();
    try { db.ref('recipes').set(recipes).catch(() => {}); } catch(e) {}
    displayRecipes(filteredRecipes);
    displayTrash();
}

function displayTrash() {
    const container = document.getElementById('trash-list');
    container.innerHTML = '';
    if (trash.length === 0) {
        container.innerHTML = '<p class="trash-empty">Keine Fails bisher.</p>';
    } else {
        trash.forEach(recipe => {
            const daysLeft = Math.ceil((TRASH_TTL - (Date.now() - recipe.deletedAt)) / (24 * 60 * 60 * 1000));
            const item = document.createElement('div');
            item.className = 'trash-item';
            item.innerHTML = `
                ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}">` : '<div class="trash-no-img">🍽</div>'}
                <div class="trash-item-info">
                    <span class="trash-item-name">${recipe.name}</span>
                    <span class="trash-item-days">Noch ${daysLeft} Tag${daysLeft !== 1 ? 'e' : ''}</span>
                </div>
                <button class="restore-btn">Wiederherstellen</button>
            `;
            item.querySelector('.restore-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                restoreRecipe(recipe);
            });
            container.appendChild(item);
        });
    }
    document.getElementById('trash-overlay').style.display = 'flex';
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('smillas-recipes');
    return stored ? JSON.parse(stored) : null;
}

async function loadRecipes() {
    try {
        const snapshot = await Promise.race([
            db.ref('recipes').get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        if (snapshot.exists()) {
            const val = snapshot.val();
            recipes = Array.isArray(val) ? val.filter(r => r !== null) : Object.values(val);
            saveToLocalStorage();
        } else {
            const local = loadFromLocalStorage();
            if (local && local.length > 0) {
                recipes = local;
            } else {
                const response = await fetch('data.json');
                const data = await response.json();
                recipes = data.recipes;
                saveToLocalStorage();
            }
            db.ref('recipes').set(recipes).catch(() => {});
        }
    } catch (e) {
        const local = loadFromLocalStorage();
        if (local && local.length > 0) {
            recipes = local;
        } else {
            const response = await fetch('data.json');
            const data = await response.json();
            recipes = data.recipes;
            saveToLocalStorage();
        }
    }
    // Papierkorb laden
    try {
        const tsnap = await Promise.race([
            db.ref('trash').get(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        if (tsnap.exists()) {
            const val = tsnap.val();
            trash = Array.isArray(val) ? val.filter(r => r !== null) : Object.values(val);
        } else {
            trash = JSON.parse(localStorage.getItem('smillas-trash') || '[]');
        }
    } catch(e) {
        trash = JSON.parse(localStorage.getItem('smillas-trash') || '[]');
    }
    cleanupTrash();

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
            ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}">` : '<div class="card-no-image">🍽</div>'}
            <div class="card-bottom">
                <h3>${recipe.name}</h3>
                <button class="delete-btn" title="Zu Fails">🗑</button>
            </div>
        `;
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteRecipe(recipe);
        });
        card.addEventListener('click', () => showRecipeDetail(recipe));
        container.appendChild(card);
    });
}

function showRecipeDetail(recipe) {
    const content = document.getElementById('recipe-detail-content');
    content.innerHTML = `
        ${recipe.image ? `<img src="${recipe.image}" alt="${recipe.name}">` : '<div class="detail-no-image">🍽</div>'}
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

document.getElementById('trash-btn').addEventListener('click', displayTrash);
document.getElementById('close-trash').addEventListener('click', () => {
    document.getElementById('trash-overlay').style.display = 'none';
});
document.getElementById('trash-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'trash-overlay') document.getElementById('trash-overlay').style.display = 'none';
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

    if (!name || !description || !instructions || !calories || !protein || !category || meal.length === 0 || !size) {
        alert('Bitte alle erforderlichen Felder ausfüllen und mindestens eine Mahlzeit auswählen!');
        return;
    }

    const newRecipe = {
        id: Date.now(),
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

    // UI sofort aktualisieren, Firebase im Hintergrund speichern
    displayRecipes(filteredRecipes);
    document.getElementById('add-recipe-overlay').style.display = 'none';
    resetForm();

    saveToLocalStorage();
    try {
        db.ref('recipes').set(recipes).catch(() => {});
    } catch (e) {}

    // In Realität würde man das in data.json speichern, aber für Demo reicht das.
}

function resetForm() {
    selectedImageDataUrl = '';
    document.getElementById('recipe-name').value = '';
    document.getElementById('recipe-image').value = '';
    document.getElementById('recipe-description').value = '';
    document.getElementById('recipe-ingredients').value = '';
    document.getElementById('recipe-instructions').value = '';
    document.getElementById('recipe-calories').value = '';
    document.getElementById('recipe-protein').value = '';
    document.getElementById('recipe-category').value = 'süß';
    document.getElementById('recipe-size').value = 'klein';
    document.getElementById('recipe-tags').value = '';
    document.querySelectorAll('.meal-checkbox').forEach(cb => cb.checked = false);
    const preview = document.getElementById('recipe-image-preview');
    preview.src = '';
    preview.style.display = 'none';
}

// Sicherstellen dass Overlay und Formular beim Start sauber sind
document.getElementById('add-recipe-overlay').style.display = 'none';
resetForm();

loadRecipes();