let recipes = [];
let filteredRecipes = [];
const recipeScaleMap = new Map();
let trash = [];
let selectedImageDataUrl = '';
let activeRecipeId = null;

firebase.auth().onAuthStateChanged((user) => {
    applyAuthUI(user);
});

const TRASH_TTL = 5 * 24 * 60 * 60 * 1000;

function saveToLocalStorage() {
    localStorage.setItem('smillas-recipes', JSON.stringify(recipes));
}

function saveTrash() {
    localStorage.setItem('smillas-trash', JSON.stringify(trash));

    try {
        db.ref('trash').set(trash)
            .then(() => {
                console.log("Trash gespeichert");
            })
            .catch((err) => {
                console.error(err);
                alert(err.message);
            });

    } catch (e) {
        console.error(e);
    }
}

function cleanupTrash() {
    const before = trash.length;
    trash = trash.filter(r => Date.now() - r.deletedAt < TRASH_TTL);
    if (trash.length !== before) saveTrash();
}

function deleteRecipe(recipe) {
    if (!firebase.auth().currentUser) {
        alert("Bitte einloggen!");
        return;
    }

    recipes = recipes.filter(r => r.id !== recipe.id);
    filteredRecipes = filteredRecipes.filter(r => r.id !== recipe.id);

    trash.push({ ...recipe, deletedAt: Date.now() });

    saveToLocalStorage();
    saveTrash();

    try {
        db.ref('recipes').set(recipes)
            .then(() => {
                console.log("Rezepte aktualisiert");
            })
            .catch((err) => {
                console.error(err);
                alert(err.message);
            });

    } catch(e) {
        console.error(e);
    }

    displayRecipes(filteredRecipes);
}
function restoreRecipe(recipe) {
    if (!firebase.auth().currentUser) {
        alert("Bitte einloggen!");
        return;
    }

    trash = trash.filter(r => r.id !== recipe.id);

    const { deletedAt, ...clean } = recipe;

    recipes.push(clean);
    filteredRecipes = [...recipes];

    saveToLocalStorage();
    saveTrash();

    try {
        db.ref('recipes').set(recipes)
            .then(() => {
                console.log("Rezepte wiederhergestellt");
            })
            .catch((err) => {
                console.error(err);
                alert(err.message);
            });

    } catch(e) {
        console.error(e);
    }

    displayRecipes(filteredRecipes);
    displayTrash();
}

function permanentlyDeleteRecipe(id) {

    if (!firebase.auth().currentUser) {
        alert("Bitte einloggen!");
        return;
    }

    trash = trash.filter(r => r.id !== id);

    saveTrash();

    displayTrash();
}

function displayTrash() {
    const container = document.getElementById('trash-list');
    container.innerHTML = '';

    if (!trash.length) {
        container.innerHTML = '<p class="trash-empty">Papierkorb ist leer.</p>';
    } else {
        trash.forEach(recipe => {
            const daysLeft = Math.ceil(
                (TRASH_TTL - (Date.now() - recipe.deletedAt)) /
                (24 * 60 * 60 * 1000)
            );

            const item = document.createElement('div');
            item.className = 'trash-item';

            item.innerHTML = `

                <div class="trash-item-info">
                    <span class="trash-item-name">${recipe.name}</span>
                    <span class="trash-item-days">Noch ${daysLeft} Tage</span>
                </div>

                <div class="trash-buttons">
                    <button class="restore-btn">Wiederherstellen</button>
                    <button class="delete-forever-btn">Endgültig löschen</button>
                </div>
            `;

            item.querySelector('.restore-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                restoreRecipe(recipe);
            });

            item.querySelector('.delete-forever-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                permanentlyDeleteRecipe(recipe.id);
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
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 5000)
            )
        ]);

        if (snapshot.exists()) {

            const val = snapshot.val();

            recipes = Array.isArray(val)
                ? val.filter(r => r !== null)
                : Object.values(val);

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

            db.ref('recipes').set(recipes)
                .then(() => {
                    console.log("Firebase initial gespeichert");
                })
                .catch((err) => {
                    console.error(err);
                    alert(err.message);
                });
        }

    } catch (e) {

        console.error(e);

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
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), 5000)
            )
        ]);

        if (tsnap.exists()) {

            const val = tsnap.val();

            trash = Array.isArray(val)
                ? val.filter(r => r !== null)
                : Object.values(val);

        } else {

            trash = JSON.parse(
                localStorage.getItem('smillas-trash') || '[]'
            );
        }

    } catch(e) {

        console.error(e);

        trash = JSON.parse(
            localStorage.getItem('smillas-trash') || '[]'
        );
    }

    cleanupTrash();

    // Kaputte via.placeholder.com URLs automatisch ersetzen
    let migrated = false;

    recipes = recipes.map(r => {

        if (
            r.image &&
            r.image.includes('via.placeholder.com')
        ) {

            migrated = true;

            return {
                ...r,
                image: r.image.replace(
                    /https:\/\/via\.placeholder\.com\/(\d+x\d+)\?/,
                    'https://placehold.co/$1/0d1f22/00bcd4?'
                )
            };
        }

        return r;
    });

    if (migrated) {

        saveToLocalStorage();

        try {

            db.ref('recipes').set(recipes)
                .then(() => {
                    console.log("Migration gespeichert");
                })
                .catch((err) => {
                    console.error(err);
                    alert(err.message);
                });

        } catch(e) {

            console.error(e);
        }
    }

    filteredRecipes = [...recipes];

    displayRecipes(filteredRecipes);
}

function isUrl(str) {
    return str && (str.startsWith('data:') || str.startsWith('http'));
}

function roundScale(value) {
    if (!Number.isFinite(value)) {
        return value;
    }
    const stepped = Math.ceil(value / 0.25) * 0.25;
    return Number(stepped.toFixed(2));
}

function doesRecipeFitAtScale(recipe, scale, nutritionFilters) {
    return nutritionFilters.every(({ field, min, max }) => {
        const rawValue = Number(recipe[field]);
        const scaledValue = Number.isFinite(rawValue) ? rawValue * scale : 0;

        if (min > 0 && scaledValue < min) {
            return false;
        }
        if (max < Infinity && scaledValue > max) {
            return false;
        }
        return true;
    });
}

function findMinimalScaleForRecipe(recipe, nutritionFilters) {
    let minFactor = 1;
    let maxFactor = Infinity;

    for (const { field, min, max } of nutritionFilters) {
        const rawValue = Number(recipe[field]);
        const hasValue = Number.isFinite(rawValue);

        if (min > 0) {
            if (!hasValue || rawValue <= 0) {
                return null;
            }
            minFactor = Math.max(minFactor, min / rawValue);
        }

        if (max < Infinity && hasValue && rawValue > 0) {
            maxFactor = Math.min(maxFactor, max / rawValue);
        }
    }

    if (minFactor > maxFactor) {
        return null;
    }

    const candidate = Math.max(1, roundScale(minFactor));
    if (candidate > maxFactor) {
        return null;
    }
    if (!doesRecipeFitAtScale(recipe, candidate, nutritionFilters)) {
        return null;
    }

    return candidate;
}

function imgHtml(recipe, type) {
    if (isUrl(recipe.image)) {
        return type === 'card'
            ? `<img src="${recipe.image}" alt="${recipe.name}">`
            : `<img src="${recipe.image}" alt="${recipe.name}">`;
    }
    const emoji = recipe.image || '🍽';
    const cls = type === 'card' ? 'card-no-image' : 'detail-no-image';
    return `<div class="${cls}">${emoji}</div>`;
}
function displayRecipes(recipesToDisplay) {
    const container = document.getElementById('recipes-grid');
    container.innerHTML = '';

    const grouped = {
        "Hauptspeisen": [],
        "Snacks": [],
        "Basen & Zusätze": [],
        "Brote & Sauerteigstuff": [],
        "Unsortiert": []
    };

    recipesToDisplay.forEach(recipe => {
        const mealValue = Array.isArray(recipe.meal) ? recipe.meal[0] : recipe.meal;
        const group = mealToGroup[mealValue] || "Unsortiert";
        grouped[group].push(recipe);
    });

    mealOrder.forEach(group => {
        const groupRecipes = grouped[group];
        if (!groupRecipes.length) return;

        const section = document.createElement('div');
        section.className = 'meal-section';

        const heading = document.createElement('h2');
        heading.className = 'meal-heading';
        heading.textContent = group;

        const grid = document.createElement('div');
        grid.className = 'meal-grid';

        groupRecipes.forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            const matchedScale = recipeScaleMap.get(recipe.id);
            const badgeHtml = matchedScale && matchedScale > 1 ? `<span class="scale-badge">${matchedScale}x</span>` : '';

            const caloriesText = Number.isFinite(recipe.calories) ? `${formatScaledQuantity(recipe.calories * (matchedScale || 1))} kcal` : '– kcal';
            const proteinText = Number.isFinite(recipe.protein) ? `${formatScaledQuantity(recipe.protein * (matchedScale || 1))} g Protein` : '– g Protein';

            card.innerHTML = `
                ${badgeHtml}
                ${imgHtml(recipe, 'card')}
                <div class="card-bottom">
                    <div class="card-title-actions">
                        <h3>${recipe.name}</h3>
                        <div class="card-actions">
                            <button class="favorite-btn" title="Favorit">
                                ${recipe.favorite ? "❤️" : "🤍"}
                            </button>
                            <button class="edit-btn" title="Bearbeiten">✏️</button>
                            <button class="delete-btn" title="Löschen">🗑️</button>
                        </div>
                    </div>
                    <div class="card-nutrition">
                        <div class="nutrition-item">
                            
                            <strong>${caloriesText}</strong>
                        </div>
                        <div class="nutrition-item">
                        
                            <strong>${proteinText}</strong>
                        </div>
                    </div>
                </div>
            `;
            card.querySelector('.favorite-btn').addEventListener('click', (e) => {
                e.stopPropagation();

                if (!firebase.auth().currentUser) {
                    alert("Bitte einloggen!");
                    return;
                }

                recipe.favorite = !recipe.favorite;

                saveToLocalStorage();
                db.ref('recipes').set(recipes);

                displayRecipes(filteredRecipes);
            });

            card.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openRecipeForm(recipe);
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteRecipe(recipe);
            });

            card.addEventListener('click', () => showRecipeDetail(recipe, matchedScale || 1));

            grid.appendChild(card);
        });

        section.appendChild(heading);
        section.appendChild(grid);
        container.appendChild(section);
    });
    applyAuthUI(firebase.auth().currentUser);
}

let detailOriginalIngredients = [];
let detailCurrentScale = 1;
let detailOriginalNutrition = { calories: null, protein: null };

function normalizeIngredientLines(recipe) {
    if (Array.isArray(recipe.ingredients)) {
        return recipe.ingredients.map(i => String(i).trim()).filter(Boolean);
    }
    if (typeof recipe.ingredients === 'string') {
        return recipe.ingredients
            .split(',')
            .map(i => String(i).trim())
            .filter(Boolean);
    }
    return [];
}

function parseIngredientLine(line) {
    const units = [
        'g', 'gramm', 'kg', 'kilogramm', 'ml', 'milliliter', 'l', 'liter',
        'tl', 'teelöffel', 'el', 'esslöffel', 'stück', 'stk\.?',
        'prise', 'prisen', 'packung', 'pck\.?', 'dose', 'dosen', 'becher',
        'tasse', 'tassen'
    ].join('|');

    const regex = new RegExp(`^\\s*((?:\\d+(?:[.,]\\d+)?(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+))\\s*(?:(${units})(?![A-Za-zÄÖÜäöüß]))?\\s*(.*)$`, 'i');
    const match = line.match(regex);

    if (!match) {
        return { hasQuantity: false, original: line };
    }

    const quantity = parseIngredientQuantity(match[1]);
    if (quantity === null) {
        return { hasQuantity: false, original: line };
    }

    return {
        hasQuantity: true,
        quantity,
        unit: match[2] ? match[2].trim() : '',
        rest: match[3] ? match[3].trim() : '',
        original: line
    };
}

function parseIngredientQuantity(quantityString) {
    const normalized = quantityString.trim().replace(',', '.');
    const mixedFraction = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixedFraction) {
        const whole = Number(mixedFraction[1]);
        const numerator = Number(mixedFraction[2]);
        const denominator = Number(mixedFraction[3]);
        if (denominator === 0) return null;
        return whole + numerator / denominator;
    }

    const simpleFraction = normalized.match(/^(\d+)\/(\d+)$/);
    if (simpleFraction) {
        const numerator = Number(simpleFraction[1]);
        const denominator = Number(simpleFraction[2]);
        if (denominator === 0) return null;
        return numerator / denominator;
    }

    const value = parseFloat(normalized);
    return Number.isFinite(value) ? value : null;
}

function formatScaledQuantity(value) {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    if (Math.abs(Math.round(value) - value) < 1e-8) {
        return String(Math.round(value));
    }
    if (Math.abs(Math.round(value * 10) - value * 10) < 1e-8) {
        return value.toFixed(1).replace(/\.0+$/, '').replace('.', ',');
    }
    if (Math.abs(Math.round(value * 100) - value * 100) < 1e-8) {
        return value.toFixed(2).replace(/\.0+$/, '').replace('.', ',');
    }
    return value.toFixed(3).replace(/\.0+$/, '').replace('.', ',');
}

function formatScaleInputValue(value) {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    if (Math.abs(Math.round(value) - value) < 1e-8) {
        return String(Math.round(value));
    }
    if (Math.abs(Math.round(value * 10) - value * 10) < 1e-8) {
        return value.toFixed(1).replace(/\.0+$/, '');
    }
    if (Math.abs(Math.round(value * 100) - value * 100) < 1e-8) {
        return value.toFixed(2).replace(/\.0+$/, '');
    }
    return value.toFixed(3).replace(/\.0+$/, '');
}

function scaleIngredientLine(line, scale) {
    const parsed = parseIngredientLine(line);
    if (!parsed.hasQuantity || scale === 1) {
        return parsed.original;
    }

    const scaledValue = parsed.quantity * scale;
    const formattedValue = formatScaledQuantity(scaledValue);
    const unitPart = parsed.unit ? ` ${parsed.unit}` : '';
    const restPart = parsed.rest ? ` ${parsed.rest}` : '';
    return `${formattedValue}${unitPart}${restPart}`.trim();
}

function setRecipeDetailScale(scale) {
    if (!Number.isFinite(scale) || scale <= 0) {
        return;
    }
    detailCurrentScale = scale;
    const ingredientList = document.getElementById('recipe-ingredients-list');
    if (ingredientList) {
        ingredientList.innerHTML = detailOriginalIngredients
            .map((ingredient) => renderIngredientListItem(ingredient, scale))
            .join('');
    }

    const input = document.getElementById('scale-factor-input');
    if (input) {
        input.value = formatScaleInputValue(scale);
    }

    const caloriesValue = document.getElementById('recipe-calories-value');
    const proteinValue = document.getElementById('recipe-protein-value');
    if (caloriesValue && Number.isFinite(detailOriginalNutrition.calories)) {
        caloriesValue.textContent = formatScaledQuantity(detailOriginalNutrition.calories * scale);
    }
    if (proteinValue && Number.isFinite(detailOriginalNutrition.protein)) {
        proteinValue.textContent = formatScaledQuantity(detailOriginalNutrition.protein * scale);
    }

    const scaleInput = document.getElementById('scale-factor-input');
    if (scaleInput) {
        scaleInput.value = formatScaleInputValue(scale);
    }
}

function isIngredientHeading(ingredient) {
    return /^\[.+\]$/.test(String(ingredient).trim());
}

function formatIngredientHeading(ingredient) {
    return String(ingredient).trim().replace(/^\[|\]$/g, '');
}

function renderIngredientListItem(ingredient, scale) {
    if (isIngredientHeading(ingredient)) {
        return `<li class="ingredient-heading">${formatIngredientHeading(ingredient)}</li>`;
    }

    return `<li>${scaleIngredientLine(ingredient, scale)}</li>`;
}

function showRecipeDetail(recipe, initialScale = 1) {
    const content = document.getElementById('recipe-detail-content');
    const normalizedIngredients = normalizeIngredientLines(recipe);
    detailOriginalIngredients = normalizedIngredients;
    detailCurrentScale = initialScale;

    detailOriginalNutrition = {
        calories: Number(recipe.calories),
        protein: Number(recipe.protein)
    };

    content.innerHTML = `
        ${imgHtml(recipe, 'detail')}
        <div class="detail-header">
            <h2>${recipe.name}</h2>
            <div class="detail-scaling-controls">
                <span class="detail-scaling-label">Portionen</span>
                <div class="portion-control">
                    <button id="scale-decrease" type="button">−</button>
                    <input id="scale-factor-input" type="number" min="0.25" step="0.25" value="${formatScaleInputValue(initialScale)}" />
                    <button id="scale-increase" type="button">+</button>
                </div>
            </div>
            <button id="detail-edit-btn" class="edit-btn" type="button">Bearbeiten</button>
        </div>
        <p class="detail-description">${recipe.description}</p>
        <div class="detail-meta">
            <span><strong id="recipe-calories-value">${Number.isFinite(detailOriginalNutrition.calories) ? formatScaledQuantity(detailOriginalNutrition.calories * detailCurrentScale) : recipe.calories}</strong> kcal</span>
            <span><strong id="recipe-protein-value">${Number.isFinite(detailOriginalNutrition.protein) ? formatScaledQuantity(detailOriginalNutrition.protein * detailCurrentScale) : recipe.protein}</strong>g Protein</span>
            <span>${recipe.category}</span>
            <span>${Array.isArray(recipe.meal) ? recipe.meal.join(', ') : recipe.meal}</span>
            <span>${recipe.size}</span>
        </div>
        <h4>Zutaten</h4>
        <ul id="recipe-ingredients-list">
            ${normalizedIngredients.map((ingredient) => renderIngredientListItem(ingredient, detailCurrentScale)).join('')}
        </ul>
        <h4>Zubereitung</h4>
        <p>${recipe.instructions}</p>
    `;

    const detailEditButton = document.getElementById('detail-edit-btn');

    if (detailEditButton) {
        detailEditButton.style.display = firebase.auth().currentUser ? "inline-block" : "none";
        detailEditButton.addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('recipe-detail-overlay').style.display = 'none';
            openRecipeForm(recipe);
        });
    }

    const decreaseButton = document.getElementById('scale-decrease');
    const increaseButton = document.getElementById('scale-increase');
    const scaleInput = document.getElementById('scale-factor-input');

    if (decreaseButton) {
        decreaseButton.addEventListener('click', () => {
            const next = Math.max(0.25, Number((detailCurrentScale - 0.25).toFixed(2)));
            setRecipeDetailScale(next);
        });
    }

    if (increaseButton) {
        increaseButton.addEventListener('click', () => {
            const next = Number((detailCurrentScale + 0.25).toFixed(2));
            setRecipeDetailScale(next);
        });
    }

    if (scaleInput) {
        scaleInput.addEventListener('change', () => {
            const factor = Number(scaleInput.value);
            if (!Number.isFinite(factor) || factor <= 0) {
                scaleInput.value = formatScaleInputValue(detailCurrentScale);
                return;
            }
            setRecipeDetailScale(roundScale(factor));
        });
        scaleInput.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') {
                scaleInput.dispatchEvent(new Event('change'));
            }
        });
    }

    setRecipeDetailScale(detailCurrentScale);
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

document.getElementById('search-input').addEventListener('input', function() {
    const clearBtn = document.getElementById('clear-search-btn');
    if (this.value.length > 0) {
        clearBtn.classList.add('visible');
    } else {
        clearBtn.classList.remove('visible');
    }
    filterRecipes();
});

document.getElementById('clear-search-btn').addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    const searchInput = document.getElementById('search-input');
    searchInput.value = '';
    this.classList.remove('visible');
    filterRecipes();
    searchInput.focus();
});

document.getElementById('filter-btn').addEventListener('click', () => {
    const overlay = document.getElementById('filter-overlay');
    const popup = document.getElementById('filter-popup');

    overlay.classList.add('active');

    // Scroll immer nach oben setzen
    popup.scrollTop = 0;
});

document.getElementById('apply-filters').addEventListener('click', applyFilters);

document.getElementById('reset-filters').addEventListener('click', resetFilters);

document.getElementById('close-filter').addEventListener('click', closeFilter);

document.getElementById('filter-overlay').addEventListener('click', (event) => {
    // Nur auf Mobile schließen (unter 1024px)
    if (event.target.id === 'filter-overlay' && window.innerWidth < 1024) {
        closeFilter();
    }
});

function resetFilters() {
    document.getElementById('min-calories').value = '';
    document.getElementById('max-calories').value = '';
    document.getElementById('min-protein').value = '';
    document.getElementById('max-protein').value = '';
    document.querySelectorAll('#filter-popup input[type="checkbox"]').forEach(cb => cb.checked = false);
    applyFilters();
}

function closeFilter() {
    document.getElementById('filter-overlay').classList.remove('active');
}

function filterRecipes() {
    applyFilters();
} 
function applyFilters() {
    const query = document.getElementById('search-input').value.toLowerCase();

    const minCalories = parseInt(document.getElementById('min-calories').value) || 0;
    const maxCalories = parseInt(document.getElementById('max-calories').value) || Infinity;
    const minProtein = parseInt(document.getElementById('min-protein').value) || 0;
    const maxProtein = parseInt(document.getElementById('max-protein').value) || Infinity;

    const selectedCategories = Array.from(document.querySelectorAll('.category-filter:checked')).map(cb => cb.value);
    const selectedMeals = Array.from(document.querySelectorAll('.meal-filter:checked')).map(cb => cb.value);
    const selectedSizes = Array.from(document.querySelectorAll('.size-filter:checked')).map(cb => cb.value);

    const nutritionFilters = [
        { field: 'calories', min: minCalories, max: maxCalories },
        { field: 'protein', min: minProtein, max: maxProtein }
    ];

    recipeScaleMap.clear();

    filteredRecipes = recipes.filter(recipe => {
        const recipeIngredients = Array.isArray(recipe.ingredients)
            ? recipe.ingredients
            : (typeof recipe.ingredients === 'string' ? recipe.ingredients.split(',').map(i => i.trim()) : []);

        const matchesSearch =
            !query ||
            recipe.name.toLowerCase().includes(query) ||
            recipe.description.toLowerCase().includes(query) ||
            recipeIngredients.some(ing => ing.toLowerCase().includes(query));

        const matchedScale = findMinimalScaleForRecipe(recipe, nutritionFilters);
        if (!matchedScale) {
            return false;
        }
        recipeScaleMap.set(recipe.id, matchedScale);

        return (
            matchesSearch &&
            (selectedCategories.length === 0 || selectedCategories.includes(recipe.category)) &&
            (selectedMeals.length === 0 || selectedMeals.includes(recipe.meal)) &&
            (selectedSizes.length === 0 || selectedSizes.includes(recipe.size))
        );
    });

    displayRecipes(filteredRecipes);

    // Nur auf Mobile Overlay schließen (unter 1024px)
    document.getElementById('apply-filters').addEventListener('click', () => {
        applyFilters();
        closeFilter();
    });   
}

document.getElementById('add-recipe-btn').addEventListener('click', () => openRecipeForm());

document.getElementById('trash-btn').addEventListener('click', displayTrash);
document.getElementById('close-trash').addEventListener('click', () => {
    document.getElementById('trash-overlay').style.display = 'none';
});
document.getElementById('trash-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'trash-overlay') document.getElementById('trash-overlay').style.display = 'none';
});

const savoryEmojis = [
    '🍕','🍔','🥪','🌮','🌯','🥙','🧆','🥗',
    '🧀','🥩','🍳','🥘','🍲','🍛','🍜','🍝',
    '🥖','🥟', '🥫'
];

const sweetEmojis = [
    '🍰','🥧','🥐','🍪','🍮','🍦', '⚪',
    '🧇','🥞','🍫'
];

const fruitVeggieEmojis = [
    '🥒','🥕','🥔','🍠','🍎','🍉', '🥥', '🍌'
];

let emojiMode = 'ai';
function buildEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.innerHTML = '';

    // HERZHAFT
    const savoryRow = document.createElement('div');
    savoryRow.className = 'emoji-row';

    savoryEmojis.forEach(emoji => {
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.className = 'emoji-option';
        btn.textContent = emoji;

        btn.addEventListener('click', (e) => {
            e.preventDefault();

            selectEmoji(emoji);

            document
                .querySelectorAll('#emoji-picker .emoji-option')
                .forEach(b => b.classList.remove('selected'));

            btn.classList.add('selected');
        });

        savoryRow.appendChild(btn);
    });

    // SÜSS
    const sweetRow = document.createElement('div');
    sweetRow.className = 'emoji-row';

    sweetEmojis.forEach(emoji => {
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.className = 'emoji-option';
        btn.textContent = emoji;

        btn.addEventListener('click', (e) => {
            e.preventDefault();

            selectEmoji(emoji);

            document
                .querySelectorAll('#emoji-picker .emoji-option')
                .forEach(b => b.classList.remove('selected'));

            btn.classList.add('selected');
        });

        sweetRow.appendChild(btn);
    });

    // OBST & GEMÜSE
    const fruitRow = document.createElement('div');
    fruitRow.className = 'emoji-row';

    fruitVeggieEmojis.forEach(emoji => {
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.className = 'emoji-option';
        btn.textContent = emoji;

        btn.addEventListener('click', (e) => {
            e.preventDefault();

            selectEmoji(emoji);

            document
                .querySelectorAll('#emoji-picker .emoji-option')
                .forEach(b => b.classList.remove('selected'));

            btn.classList.add('selected');
        });

        fruitRow.appendChild(btn);
    });

    picker.appendChild(savoryRow);
    picker.appendChild(sweetRow);
    picker.appendChild(fruitRow);
}

buildEmojiPicker();

function selectEmoji(emoji) {
    selectedImageDataUrl = emoji;
    document.getElementById('recipe-image').value = '';
    document.getElementById('recipe-image-preview').style.display = 'none';
}

function updateAIView(name) {
    const view = document.getElementById('emoji-ai-view');
    const suggestions = suggestEmojis(name);
    if (!name || suggestions.length === 0) {
        view.innerHTML = '<p class="emoji-hint">Namen eingeben für Vorschläge</p>';
        return;
    }
    const top3 = suggestions.slice(0, 3);
    view.innerHTML = '';
    top3.forEach((emoji, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'emoji-ai-btn' + (i === 0 ? ' selected' : '');
        btn.textContent = emoji;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.emoji-ai-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectEmoji(emoji);
        });
        view.appendChild(btn);
    });
    const allFoodEmojis = [...savoryEmojis, ...sweetEmojis];
    if (selectedImageDataUrl === '' || Object.keys(emojiKeywords).includes(selectedImageDataUrl) || allFoodEmojis.includes(selectedImageDataUrl)) {
        selectEmoji(top3[0]);
    }
}

document.getElementById('mode-ai').addEventListener('click', () => {
    emojiMode = 'ai';
    document.getElementById('mode-ai').classList.add('active');
    document.getElementById('mode-manual').classList.remove('active');
    document.getElementById('emoji-ai-view').style.display = '';
    document.getElementById('emoji-manual-view').style.display = 'none';
    updateAIView(document.getElementById('recipe-name').value);
});

document.getElementById('mode-manual').addEventListener('click', () => {
    emojiMode = 'manual';
    document.getElementById('mode-manual').classList.add('active');
    document.getElementById('mode-ai').classList.remove('active');
    document.getElementById('emoji-ai-view').style.display = 'none';
    document.getElementById('emoji-manual-view').style.display = '';
});

document.getElementById('recipe-image').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    clearEmojiSelection();
    const reader = new FileReader();
    reader.onload = function (e) {
        selectedImageDataUrl = e.target.result;
        const preview = document.getElementById('recipe-image-preview');
        preview.src = selectedImageDataUrl;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
});


function clearEmojiSelection() {
    document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
}

const emojiKeywords = {
    '🍕': ['pizza', 'flammkuchen'],
    '🍔': ['burger', 'hamburger'],
    '🍝': ['pasta', 'nudel', 'spaghetti', 'linguine', 'penne', 'tagliatelle', 'lasagne', 'bolognese'],
    '🥗': ['salat', 'bowl', 'caesar'],
    '🍲': ['suppe', 'eintopf', 'brühe', 'chili'],
    '🍜': ['ramen', 'pho', 'nudelsuppe', 'miso'],
    '🥘': ['pfanne', 'wok', 'paella', 'risotto'],
    '🍛': ['curry', 'dhal', 'indisch'],
    '🌮': ['taco', 'tortilla'], 
    '🌯': ['burrito', 'wrap'],
    '🥙': ['döner', 'fladenbrot', 'pita'],
    '🧆': ['falafel', 'bällchen', 'taler'],
    '🥪': ['sandwich', 'wrap', 'belegtes', 'snack'],
    '🥐': ['croissant', 'blätterteig', 'hörnchen'],
    '🥖': ['brot', 'baguette'],
    '🥞': ['pancake', 'pfannkuchen', 'crêpe',],
    '🍮': ['pudding', 'flan', 'creme'],
    '🥧': ['pie', 'apfelkuchen', 'tarte', 'quiche', 'blätterteig'],
    '🧇': ['waffel'],
    '🍽': ['gericht', 'essen', 'mahlzeit', 'food'],
    '🍰': ['kuchen', 'torte', 'tarte', 'dessert'],
    '🍩': ['donut', 'krapfen'],
    '🍪': ['keks', 'cookie', 'plätzchen'],
    '🍫': ['schoko', 'brownie', 'mousse', 'kakao'],
    '🍦': ['eis', 'sorbet', 'frozen'],
    '⚪': ['knödel', 'klumpen', 'creme', 'quark'],
    '🥟': ['dumpling', 'teigtasche', 'gyoza'],
    '🍎': ['apfel', 'obst', 'frucht'],
    '🥒': ['gurke', 'salat', 'gemüse'],
    '🥕': ['karotte', 'möhre', 'gemüse'],
    '🥔': ['kartoffel', 'pommes', 'püree', 'ofenkartoffel'],
    '🥫': ['sauce', 'soße', 'eintopf'],
    '🍉': ['wassermelone', 'obst', 'frucht'],
    '🥥': ['kokos', 'cocos',],
    '🥩': ['steak', 'fleisch', 'schnitzel'],
    '🍳': ['ei', 'omelett', 'rührei', 'spiegelei'],
    '🧀': ['käse', 'cheese', 'mozzarella', 'parmesan', 'feta'],
    '🍠': ['süßkartoffel', 'ofenkartoffel', 'sweetpotato']
};

function suggestEmojis(name) {
    const lower = name.toLowerCase();
    const scores = {};
    for (const [emoji, keywords] of Object.entries(emojiKeywords)) {
        for (const kw of keywords) {
            if (lower.includes(kw)) {
                scores[emoji] = (scores[emoji] || 0) + kw.length;
            }
        }
    }
    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([emoji]) => emoji);
}

document.getElementById('recipe-name').addEventListener('input', function () {
    if (emojiMode === 'ai') updateAIView(this.value);
});

document.getElementById('parse-recipe-text-btn')?.addEventListener('click', handleParseRecipeText);

document.getElementById('save-recipe').addEventListener('click', saveRecipe);
document.getElementById('cancel-recipe').addEventListener('click', () => {
    document.getElementById('add-recipe-overlay').classList.remove('active');
    resetForm();
});

document.getElementById('add-recipe-overlay').addEventListener('click', (event) => {
    if (event.target.id === 'add-recipe-overlay') {
        document.getElementById('add-recipe-overlay').classList.remove('active');
    }
});

function setParseStatus(message, isError = false) {
    const status = document.getElementById('recipe-parse-status');
    const error = document.getElementById('recipe-parse-error');
    if (status) status.textContent = isError ? '' : message;
    if (error) error.textContent = isError ? message : '';
}

function setParseLoading(isLoading) {
    const button = document.getElementById('parse-recipe-text-btn');
    const status = document.getElementById('recipe-parse-status');
    if (button) button.disabled = isLoading;
    if (status) status.textContent = isLoading ? 'Analyse läuft…' : '';
}

async function handleParseRecipeText() {
    const text = document.getElementById('recipe-text-input')?.value.trim();
    if (!text) {
        setParseStatus('Bitte zuerst Rezepttext eingeben.', true);
        return;
    }

    const rawFactor = document.getElementById('recipe-import-factor')?.value.trim() || '1';
    const importFactor = parseFloat(rawFactor.replace(',', '.'));
    const scale = importFactor > 0 ? importFactor : 1;

    setParseStatus('', false);
    setParseLoading(true);

    try {
        const parsed = await parseRecipeText(text, scale);

        if (!parsed || (!parsed.ingredients?.length && !parsed.instructions)) {
            setParseStatus('Kein Rezept erkannt. Bitte einen anderen Text probieren.', true);
            return;
        }

        prefillParsedRecipe(parsed);
        setParseStatus('Formular wurde vorgefüllt. Bitte prüfen und speichern.', false);
    } catch (err) {
        console.error(err);
        setParseStatus('Analyse fehlgeschlagen. Bitte später erneut versuchen.', true);
    } finally {
        setParseLoading(false);
    }
}

async function parseRecipeText(text, scale = 1) {
    return parseRecipeTextLocally(text, scale);
}

function prefillParsedRecipe(parsed) {
    if (parsed.ingredients) {
        document.getElementById('recipe-ingredients').value = Array.isArray(parsed.ingredients)
            ? parsed.ingredients.join(', ')
            : parsed.ingredients;
    }
    if (parsed.instructions) {
        document.getElementById('recipe-instructions').value = Array.isArray(parsed.instructions)
            ? parsed.instructions.join('\n')
            : parsed.instructions;
    }
    if (parsed.calories != null && !Number.isNaN(parsed.calories)) {
        document.getElementById('recipe-calories').value = parsed.calories;
    }
    if (parsed.protein != null && !Number.isNaN(parsed.protein)) {
        document.getElementById('recipe-protein').value = parsed.protein;
    }
}

function parseRecipeTextLocally(text, scale = 1) {
    const cleaned = text
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/www\.\S+/gi, '')
        .replace(/@\S+/g, '')
        .replace(/#\S+/g, '')
        .replace(/(Abonniere|Follow|Folgt|Like|Teile|Subscribe|Werbung|Anzeige|Sponsored|Promo|Rabatt|Code|Instagram|TikTok|YouTube|Spotify|Facebook|Twitter|Video|Musik|Folgt mir|Hier ist das Rezept|Hier zeige ich|In diesem Video)/gi, '')
        .replace(/\r\n/g, '\n')
        .replace(/\t/g, ' ')
        .trim();

    const lines = cleaned
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !isIrrelevantLine(line));

    if (!lines.length) {
        return null;
    }

    const calories = extractNumber(cleaned, /(?:kalorien|kcal)\s*[:\-]?\s*(\d{2,4})/i) || extractNumber(cleaned, /(\d{2,4})\s*kcal/i);
    const protein = extractNumber(cleaned, /(?:protein|eiweiß)\s*[:\-]?\s*(\d{1,3})\s*(?:g)?/i) || extractNumber(cleaned, /(\d{1,3})\s*(?:g|gramm)\s*(?:protein|eiweiß)/i);

    const sections = splitRecipeSections(lines);

    const ingredients = sections.ingredients
        .map(cleanIngredientLine)
        .map(line => scaleIngredientLine(line, scale))
        .filter(Boolean);
    const rawInstructions = sections.instructions.map(cleanInstructionLine).filter(Boolean);
    const instructions = numberInstructions(rawInstructions);

    if (!ingredients.length && !rawInstructions.length && calories == null && protein == null) {
        return null;
    }

    return {
        ingredients: [...new Set(ingredients)],
        instructions,
        calories: calories != null ? Math.round(calories * scale) : null,
        protein: protein != null ? Number((protein * scale).toFixed(1)) : null
    };
}

function numberInstructions(lines) {
    const sentences = lines.flatMap(line => splitInstructionSentences(line));
    return sentences
        .map((sentence, index) => `${index + 1}. ${sentence.replace(/^\d+\.\s*/, '').trim()}`)
        .join('\n');
}

function splitInstructionSentences(line) {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return [];
    }

    const parts = normalized.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜẞ0-9])/g);
    return parts
        .map(part => part.trim())
        .filter(Boolean);
}

function scaleIngredientLine(line, scale) {
    const cleaned = cleanIngredientLine(line);
    if (scale === 1) {
        return cleaned;
    }
    const quantityPattern = /^(\d+(?:[.,]\d+)?(?:\/\d+)?)(?:\s*)?(?:(g|kg|gramm|ml|l|cl|tl|tsp|el|esslöffel|teelöffel|tasse|becher|dose|dosen|stück|stk|prise|prisen|packung|handvoll|bund|scheibe|scheiben|stange|portion|portionen|spritzer)(?=\s|$|[^A-Za-zÄÖÜäöüß]))?(?:\s*)(.*)$/i;
    const match = cleaned.match(quantityPattern);
    if (!match) {
        return cleaned;
    }

    const rawQuantity = match[1];
    const unit = match[2] || '';
    const rest = match[3] ? match[3].trim() : '';
    const quantity = parseIngredientNumber(rawQuantity);
    if (!Number.isFinite(quantity)) {
        return cleaned;
    }

    const scaledValue = quantity * scale;
    const scaledQuantityText = formatScaledNumber(scaledValue);
    const scaledUnit = unit;
    return `${scaledQuantityText}${scaledUnit}${rest ? ' ' + rest : ''}`.trim();
}

function parseIngredientNumber(raw) {
    const trimmed = raw.replace(',', '.').trim();
    if (trimmed.includes('/')) {
        const parts = trimmed.split('/').map(part => part.trim());
        if (parts.length === 2) {
            const numerator = parseFloat(parts[0].replace(',', '.'));
            const denominator = parseFloat(parts[1].replace(',', '.'));
            if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
                return numerator / denominator;
            }
        }
    }
    return parseFloat(trimmed);
}

function formatScaledNumber(value) {
    if (!Number.isFinite(value)) {
        return String(value);
    }
    const rounded = Math.round(value * 100) / 100;
    if (Number.isInteger(rounded)) {
        return String(rounded);
    }
    return rounded.toString().replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
}

function splitRecipeSections(lines) {
    const ingredientHeadingRx = /\b(?:zutaten|ingredients|einkaufsliste|du brauchst|das brauchst du|was du brauchst)\b/i;
    const instructionHeadingRx = /\b(?:rezept|das rezept|zubereitung|anleitung|so geht(?:'s)?|schritte|directions|instructions|method)\b/i;
    const nutritionHeadingRx = /\b(?:nährwerte|gesamtnährwerte|makros|nutrition|kalorien|kcal|protein|eiweiß|fett|kohlenhydrate|carbs)\b/i;

    const sections = { ingredients: [], instructions: [], nutrition: [] };
    let currentSection = 'unknown';

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i].trim();
        const normalized = raw.replace(/^[\-\*•]\s*/g, '').trim();
        const lower = normalized.toLowerCase();

        if (ingredientHeadingRx.test(normalized)) {
            currentSection = 'ingredients';
            continue;
        }
        if (instructionHeadingRx.test(normalized)) {
            currentSection = 'instructions';
            continue;
        }
        if (nutritionHeadingRx.test(normalized) || isNutritionLine(normalized)) {
            currentSection = 'nutrition';
            sections.nutrition.push(normalized);
            continue;
        }

        if (currentSection === 'unknown') {
            if (isLikelyInstructionLine(normalized)) {
                currentSection = 'instructions';
            } else if (isLikelyIngredientLine(normalized)) {
                currentSection = 'ingredients';
            } else if (i === 0) {
                currentSection = 'ingredients';
            }
        }

        if (currentSection === 'ingredients') {
            if (!isNutritionLine(normalized) && !isHeadingLine(normalized)) {
                sections.ingredients.push(normalized);
            }
            continue;
        }

        if (currentSection === 'instructions') {
            if (!isNutritionLine(normalized) && !isHeadingLine(normalized)) {
                sections.instructions.push(normalized);
            }
            continue;
        }

        if (currentSection === 'unknown') {
            if (isLikelyIngredientLine(normalized)) {
                sections.ingredients.push(normalized);
            } else if (isLikelyInstructionLine(normalized)) {
                sections.instructions.push(normalized);
            }
        }
    }

    return sections;
}

function isIrrelevantLine(line) {
    const lower = line.toLowerCase();
    if (/^(abonnier|folge|folgt|like|teilt|subscribe|werbe|anzeige|sponsored|promo|rabatt|code|link in bio|klick|instagram|tiktok|youtube|facebook|twitter|spotify|musik|video|heute|in diesem video|hier ist das rezept|hier zeige ich|folgt mir|ich zeige euch)/i.test(lower)) {
        return true;
    }
    if (/^(https?:\/\/|www\.|@|#)/.test(line)) {
        return true;
    }
    if (line.length < 5 && /[^a-zäöüß0-9]/i.test(line)) {
        return true;
    }
    return false;
}

function isNutritionLine(line) {
    return /\b(?:kcal|kalorien|protein|eiweiß|fett|kohlenhydrate|carbs|nährwerte|makros|gesamtnährwerte)\b/i.test(line);
}

function isHeadingLine(line) {
    return /\b(?:zutaten|ingredients|einkaufsliste|du brauchst|das brauchst du|was du brauchst|rezept|das rezept|zubereitung|anleitung|so geht(?:'s)?|schritte|directions|instructions|method|nährwerte|gesamtnährwerte|makros|nutrition)\b/i.test(line);
}

function cleanIngredientLine(line) {
    return line.replace(/^[\-\*•]\s*/g, '').trim();
}

function cleanInstructionLine(line) {
    let cleaned = line.replace(/^[\-\*•]\s*/g, '').trim();
    cleaned = cleaned.replace(/^(\d+)\s*[:\)\.]+\s*/, '$1. ');
    return cleaned;
}

function isLikelyIngredientLine(line) {
    const normalized = line.replace(/^[\-\*•]\s*/g, '').trim();
    if (!normalized || isHeadingLine(normalized) || isNutritionLine(normalized)) {
        return false;
    }

    const quantityWithUnit = /(^|\s)\d+([.,]\d+)?(?:\/\d+)?\s*(?:g|kg|gramm|ml|l|cl|tl|tsp|el|esslöffel|teelöffel|tasse|becher|dose|dosen|stück|stk|prise|prisen|packung|handvoll|bund|scheibe|scheiben|stange|portion|portionen|spritzer)?(?=\s|$)/i;
    const simpleQuantity = /(^|\s)\d+([.,]\d+)?(?:\/\d+)?(?=\s|$)/i;
    const hasQuantity = quantityWithUnit.test(normalized) || simpleQuantity.test(normalized);
    const hasIngredientSeparator = /\b(?:und|mit|plus)\b/i.test(normalized) || /\//.test(normalized) || /,/.test(normalized);
    const containsWord = /[a-zäöüß]/i.test(normalized);
    const looksLikeInstruction = isLikelyInstructionLine(normalized);

    return (hasQuantity || hasIngredientSeparator || (containsWord && normalized.length < 90 && !/[!?]$/.test(normalized) && !looksLikeInstruction));
}

function isLikelyInstructionLine(line) {
    const normalized = line.replace(/^[\-\*•]\s*/g, '').trim();
    if (!normalized) {
        return false;
    }

    if (/^\d+\s*[:\)\.]/.test(normalized)) {
        return true;
    }
    if (/\b(?:zubereitung|anleitung|schritte|so geht(?:'s)?|directions|instructions|method)\b/i.test(normalized)) {
        return true;
    }

    const verbs = /(schneiden|hacken|anbraten|kochen|backen|vermengen|mischen|würzen|erhitzen|köcheln|servieren|hinzufügen|unterrühren|pürieren|rühren|salzen|pfeffern|marinieren|braten|garen|geben|legen|mixen|rühren|ziehen lassen|ziehen lassen|zerkleinern|schälen|schneiden|festdrücken|backen|lassen)/i;
    if (verbs.test(normalized)) {
        return true;
    }
    if (/\b(?:bei|für|in|nach|danach|dann|anschließend|anfangs|zuletzt|zuerst|nun|jetzt)\b/i.test(normalized) && /\b(?:°|grad|min|sek|stunde|stunden|ofeng|ofen|backen|kochen)\b/i.test(normalized)) {
        return true;
    }
    if (/[.!?]$/.test(normalized) && !/(^\d+\s*(?:g|ml|l|tl|el|dose|handvoll))/i.test(normalized)) {
        return true;
    }

    return false;
}

function normalizeRecipeLine(line) {
    let normalized = line.replace(/^[\-\*•]\s*/g, '').trim();
    normalized = normalized.replace(/\s{2,}/g, ' ');
    if (/^(?:für \d+ portionen|ergibt \d+ portionen|reicht für \d+ portionen)$/i.test(normalized)) {
        return '';
    }
    return normalized;
}

function extractNumber(text, regex) {
    const match = text.match(regex);
    return match ? Number(match[1].replace(',', '.')) : null;
}

async function saveRecipe() {

    if (!firebase.auth().currentUser) {
        alert("Bitte einloggen!");
        return;
    }

    const name = document.getElementById('recipe-name').value;
    const image = selectedImageDataUrl;
    const description = document.getElementById('recipe-description').value;

    const ingredients = document
        .getElementById('recipe-ingredients')
        .value
        .split(',');

    const instructions = document.getElementById('recipe-instructions').value;

    const calories = parseInt(
        document.getElementById('recipe-calories').value
    );

    const protein = parseInt(
        document.getElementById('recipe-protein').value
    );

    const category = document.getElementById('recipe-category').value;

    const meal =
        document.querySelector('input[name="meal"]:checked')?.value || null;

    const size = document.getElementById('recipe-size').value;


    if (
        !name ||
        !instructions ||
        !calories ||
        !protein ||
        !category ||
        !meal ||
        !size
    ) {
        alert(
            'Bitte alle erforderlichen Felder ausfüllen und mindestens eine Mahlzeit auswählen!'
        );
        return;
    }

    const existingRecipe = activeRecipeId
        ? recipes.find(r => r.id === activeRecipeId)
        : null;


    const recipeData = {
        id: activeRecipeId || Date.now(),
        name,
        image,
        description,
        ingredients: ingredients.map(i => i.trim()).filter(Boolean),
        instructions,
        calories,
        protein,
        category,
        meal,
        size,
        favorite: existingRecipe ? existingRecipe.favorite : false
    };

    if (activeRecipeId) {

        const existingIndex =
            recipes.findIndex(r => r.id === activeRecipeId);

        if (existingIndex !== -1) {
            recipes[existingIndex] = recipeData;
        } else {
            recipes.push(recipeData);
        }

    } else {

        recipes.push(recipeData);
    }

    activeRecipeId = null;

    filterRecipes();

    document.getElementById('add-recipe-overlay').classList.remove('active');

    resetForm();

    saveToLocalStorage();

    try {

        db.ref('recipes').set(recipes)
            .then(() => {
                console.log("Rezepte gespeichert");
            })
            .catch((err) => {
                console.error(err);
                alert(err.message);
            });

    } catch (e) {

        console.error(e);
    }
}

function openRecipeForm(recipe = null) {
    activeRecipeId = recipe ? recipe.id : null;

    if (recipe) {
        fillForm(recipe);
    } else {
        resetForm();
    }

    const overlay = document.getElementById('add-recipe-overlay');
    const form = document.getElementById('add-recipe-form');

    overlay.classList.add('active');   // 🔥 DAS ist jetzt korrekt
    form.scrollTop = 0;
}

function fillForm(recipe) {
    selectedImageDataUrl = recipe.image || '';
    document.getElementById('recipe-name').value = recipe.name || '';
    document.getElementById('recipe-text-input').value = '';
    document.getElementById('recipe-parse-status').textContent = '';
    document.getElementById('recipe-parse-error').textContent = '';
    document.getElementById('recipe-image').value = '';
    document.getElementById('recipe-description').value = recipe.description || '';
    document.getElementById('recipe-ingredients').value = Array.isArray(recipe.ingredients) ? recipe.ingredients.join(', ') : (recipe.ingredients || '');
    document.getElementById('recipe-instructions').value = recipe.instructions || '';
    document.getElementById('recipe-calories').value = recipe.calories || '';
    document.getElementById('recipe-protein').value = recipe.protein || '';
    document.getElementById('recipe-category').value = recipe.category || 'süß';
    document.getElementById('recipe-size').value = recipe.size || 'klein';
    document.querySelectorAll('input[name="meal"]').forEach(cb => {
        cb.checked = (recipe.meal === cb.value);
    });

    const preview = document.getElementById('recipe-image-preview');
    if (isUrl(recipe.image)) {
        preview.src = recipe.image;
        preview.style.display = 'block';
    } else {
        preview.src = '';
        preview.style.display = 'none';
    }

    if (recipe.image && !isUrl(recipe.image)) {
        emojiMode = 'manual';
        document.getElementById('mode-manual').classList.add('active');
        document.getElementById('mode-ai').classList.remove('active');
        document.getElementById('emoji-ai-view').style.display = 'none';
        document.getElementById('emoji-manual-view').style.display = '';
        clearEmojiSelection();
        const emojiButton = Array.from(document.querySelectorAll('.emoji-option')).find(btn => btn.textContent === recipe.image);
        if (emojiButton) emojiButton.classList.add('selected');
    } else {
        emojiMode = 'ai';
        document.getElementById('mode-ai').classList.add('active');
        document.getElementById('mode-manual').classList.remove('active');
        document.getElementById('emoji-ai-view').style.display = '';
        document.getElementById('emoji-manual-view').style.display = 'none';
        updateAIView(recipe.name || '');
    }
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
    document.getElementById('recipe-text-input').value = '';
    document.getElementById('recipe-parse-status').textContent = '';
    document.getElementById('recipe-parse-error').textContent = '';
    document.querySelectorAll('input[name="meal"]').forEach(cb => cb.checked = false);
    clearEmojiSelection();
    emojiMode = 'ai';
    document.getElementById('mode-ai').classList.add('active');
    document.getElementById('mode-manual').classList.remove('active');
    document.getElementById('emoji-ai-view').style.display = '';
    document.getElementById('emoji-manual-view').style.display = 'none';
    document.getElementById('emoji-ai-view').innerHTML = '<p class="emoji-hint">Namen eingeben für Vorschläge</p>';
    const preview = document.getElementById('recipe-image-preview');
    preview.src = '';
    preview.style.display = 'none';
}

const mealStructure = [
  {
    group: "Snacks",
    items: ["Dessert", "Gebäck / Kuchen", "Eis"]
  },
  {
    group: "Hauptspeisen",
    items: [
      "Nudelgerichte",
      "Kartoffelgerichte",
      "Reisgerichte",
      "Currygerichte",
      "Pfannengerichte",
      "Ofengerichte",
      "Aufläufe",
      "Suppen",
      "Salate",
      "Wraps / Sandwiches"
    ]
  },
  {
    group: "Basen & Zusätze",
    items: ["Belag", "Saucen", "Dressings", "Teigbasen"]
  },
  {
    group: "Brote & Sauerteigstuff",
    items: ["Brote", "Bagel", "Brötchen", "Pizzateig", "Flammkuchenteig"]
  }
];

const mealOrder = ["Hauptspeisen", "Snacks", "Basen & Zusätze", "Brote & Sauerteigstuff"];

const mealToGroup = {};
mealStructure.forEach(section => {
    section.items.forEach(item => {
        mealToGroup[item] = section.group;
    });
});


document.addEventListener("DOMContentLoaded", () => {

    function initAccordion(containerId, structure, options = {}) {
        const {
            singleSelect = false,
            inputClass = "meal-filter",
            inputName = ""
        } = options;

        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = "";

        structure.forEach(section => {

            const group = document.createElement("div");
            group.className = "accordion-group";

            const title = document.createElement("div");
            title.className = "accordion-header";
            title.textContent = section.group;

            const list = document.createElement("div");
            list.className = "accordion-content";

            section.items.forEach(item => {

                const label = document.createElement("label");

                label.innerHTML = `
                    <input
                        type="checkbox"
                        class="${inputClass}"
                        ${inputName ? `name="${inputName}"` : ""}
                        data-single="${singleSelect}"
                        value="${item}">
                    <span>${item}</span>
                `;

                list.appendChild(label);
            });

            group.appendChild(title);
            group.appendChild(list);
            container.appendChild(group);
        });
    }

    // =========================
    // FILTER (multi select)
    // =========================
    initAccordion("meal-accordion", mealStructure, {
        singleSelect: false,
        inputClass: "meal-filter"
    });

    // =========================
    // RECIPE (single select)
    // =========================
    initAccordion("recipe-accordion", mealStructure, {
        singleSelect: true,
        inputClass: "meal-recipe",
        inputName: "meal"
    });

    // =========================
    // ACCORDION OPEN/CLOSE
    // =========================
    document.addEventListener("click", (e) => {
        const header = e.target.closest(".accordion-header");
        if (!header) return;

        const content = header.nextElementSibling;
        content.classList.toggle("open");
    });

    // =========================
    // SINGLE SELECT LOGIC (Recipe only)
    // =========================
    document.addEventListener("change", (e) => {

        const input = e.target;

        if (!input.matches('#recipe-accordion input[type="checkbox"]')) return;

        if (input.dataset.single !== "true") return;

        if (input.checked) {
            document
                .querySelectorAll('#recipe-accordion input[type="checkbox"]')
                .forEach(cb => {
                    if (cb !== input) cb.checked = false;
                });
        }
    });

    // =========================
    // Event-Listener für Live-Filter
    // =========================
    // Input-Felder (Nährwertfilter)
    const filterInputs = document.querySelectorAll(
        '#min-calories, #max-calories, #min-protein, #max-protein'
    );
    filterInputs.forEach(input => {
        input.addEventListener('input', applyFilters);
    });

    // Checkboxes (Kategorien, Mahlzeiten, Größen)
    const filterCheckboxes = document.querySelectorAll(
        '.category-filter, .meal-filter, .size-filter'
    );
    filterCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', applyFilters);
    });

});

function login() {
    document.getElementById("login-overlay").style.display = "flex";
}

function logout() {
    firebase.auth().signOut();
}
function openLogout() {
    document.getElementById("logout-overlay").style.display = "flex";
}

document.getElementById("logout-btn").addEventListener("click", openLogout);

document.getElementById("backup-recipes").addEventListener("click", async () => {
    if (!firebase.auth().currentUser) {
        alert("Bitte einloggen!");
        return;
    }

    await saveBackup();
    alert("Backup wurde erstellt.");
});

document.getElementById("logout-confirm").addEventListener("click", () => {
    firebase.auth().signOut();
    document.getElementById("logout-overlay").style.display = "none";
});

document.getElementById("logout-cancel").addEventListener("click", () => {
    document.getElementById("logout-overlay").style.display = "none";
});

// Klick außerhalb schließt auch
document.getElementById("logout-overlay").addEventListener("click", (e) => {
    if (e.target.id === "logout-overlay") {
        e.target.style.display = "none";
    }
});

document.getElementById("login-btn").addEventListener("click", login);

function applyAuthUI(user) {
    const isLoggedIn = !!user;

    document.getElementById("add-recipe-btn").style.display =
        isLoggedIn ? "block" : "none";

    document.getElementById("login-btn").style.display =
        isLoggedIn ? "none" : "inline-block";

    document.getElementById("logout-btn").style.display =
        isLoggedIn ? "inline-block" : "none";

    document.querySelectorAll(".edit-btn, .delete-btn").forEach(btn => {
        btn.style.display = isLoggedIn ? "inline-block" : "none";
    });
}

document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
            document.getElementById("login-overlay").style.display = "none";
        })
        .catch(err => alert(err.message));
});

document.getElementById("login-close").addEventListener("click", () => {
    document.getElementById("login-overlay").style.display = "none";
});

const loginOverlay = document.getElementById("login-overlay");

loginOverlay.addEventListener("click", (e) => {
    if (e.target === loginOverlay) {
        loginOverlay.style.display = "none";
    }
});

let showingFavorites = false;

document.getElementById('favorites-btn').addEventListener('click', () => {

    showingFavorites = !showingFavorites;

    if (showingFavorites) {
        filteredRecipes = recipes.filter(r => r.favorite);
    } else {
        filteredRecipes = [...recipes];
    }

    displayRecipes(filteredRecipes);
});


async function saveBackup() {
    const backupKey = Date.now();
    await db.ref('backups/' + backupKey).set({
        recipes: recipes,
        timestamp: backupKey
    });

    await cleanupOldBackups();
}

async function cleanupOldBackups() {
    const snap = await db.ref('backups').orderByKey().get();
    if (!snap.exists()) return;

    const keys = [];
    snap.forEach(child => {
        keys.push(child.key);
    });

    if (keys.length <= 10) return;

    const removeCount = keys.length - 10;
    const updates = {};
    keys.slice(0, removeCount).forEach(key => {
        updates[`backups/${key}`] = null;
    });

    await db.ref().update(updates);
}

async function restoreLatestBackup() {
    const snap = await db.ref('backups').orderByKey().limitToLast(1).get();

    snap.forEach(child => {
        const data = child.val();
        recipes = data.recipes;

        db.ref('recipes').set(recipes);
    });
}

if (window.innerWidth <= 768) {
    document.getElementById('search-input').placeholder = 'Suche';
    document.getElementById('filter-btn').textContent = '☰';
}

// Sicherstellen dass Overlay und Formular beim Start sauber sind
document.getElementById('add-recipe-overlay').classList.remove('active');
resetForm();

loadRecipes();