// This file implements the infinite scrolling functionality for the gallery.
// It handles loading items dynamically as the user scrolls.

const gallery = document.getElementById('infinite-gallery');
const sentinel = document.getElementById('gallery-sentinel');
let page = 1;
const itemsPerPage = 10;

async function fetchItems(page) {
    const response = await fetch(`data/items.json?page=${page}&limit=${itemsPerPage}`);
    const data = await response.json();
    return data.items;
}

function createCard(item) {
    const card = document.createElement('a');
    card.href = item.link; // Assuming each item has a link property
    card.className = 'card-link';
    card.innerHTML = `
        <div class="card">
            <img src="${item.image}" alt="${item.title}" class="lazy-img" />
            <h3>${item.title}</h3>
            <p>${item.description}</p>
        </div>
    `;
    return card;
}

async function loadItems() {
    const items = await fetchItems(page);
    items.forEach(item => {
        const card = createCard(item);
        gallery.appendChild(card);
    });
    page++;
}

const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
        loadItems();
    }
});

observer.observe(sentinel);

// Initial load
loadItems();