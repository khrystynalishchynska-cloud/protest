// This file manages the functionality to switch between grid view, explore view, and list view.

document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('infinite-gallery');
    const gridViewButton = document.getElementById('grid-view');
    const listViewButton = document.getElementById('list-view');
    const exploreViewButton = document.getElementById('explore-view');

    gridViewButton.addEventListener('click', () => {
        gallery.classList.remove('list-view');
        gallery.classList.add('grid-view');
    });

    listViewButton.addEventListener('click', () => {
        gallery.classList.remove('grid-view');
        gallery.classList.add('list-view');
    });

    exploreViewButton.addEventListener('click', () => {
        gallery.classList.remove('list-view', 'grid-view');
    });
});