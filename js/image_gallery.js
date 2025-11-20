import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { ImageEditor } from "./image_editor_modules/editor.js";

const ICONS = {
	refresh:
		'<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65 6.35A8 8 0 1 0 19 12h-2a6 6 0 1 1-6-6c1.66 0 3.14.69 4.22 1.78L13 12h7V5z"/></svg>',
	up: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7 14l5-5 5 5H7z"/></svg>',
	folder:
		'<svg viewBox="0 0 24 24" width="32" height="32"><path fill="currentColor" d="M10 4l2 2h8a2 2 0 0 1 2 2v10c0 1.1-.9 2-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2h6z"/></svg>',
	image:
		'<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14h18zm-4-9l-3 4-2-2-4 5h12l-3-4zm-9-3a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
	sortAsc:
		'<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M7 14l5 5 5-5H7zM7 10l5-5 5 5H7z"/></svg>',
	sortDesc:
		'<svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M7 10l5-5 5 5H7zM7 14l5 5 5-5H7z" transform="scale(1,-1) translate(0,-24)"/></svg>',
	zoom: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15 3c-3.31 0-6 2.69-6 6 0 .93.21 1.81.58 2.6L3 18.17V21h2.83l6.58-6.58c.79.37 1.67.58 2.59.58 3.31 0 6-2.69 6-6s-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/></svg>',
	reset: '<svg viewBox="0 0 24 24" width="16" height="16"><polyline fill="none" stroke="currentColor" stroke-width="2" points="1 4 1 10 7 10"></polyline><path fill="none" stroke="currentColor" stroke-width="2" d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>',
	folders: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 6a2 2 0 0 1 2-2h5l2 2h9a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z"/><path fill="currentColor" d="M2 9h20v2H2z" opacity="0.55"/></svg>',
	sortName: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>',
	sortDate: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>',
	sortSize: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z"/></svg>',
};

const LIGHTBOX_ID = "sdvn-gallery-lightbox";
const SUPPORTED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp"];

function ensureLightbox() {
	if (document.getElementById(LIGHTBOX_ID)) return;
	const overlay = document.createElement("div");
	overlay.id = LIGHTBOX_ID;
	overlay.innerHTML = `
		<div class="sdvn-lightbox-backdrop">
			<button class="sdvn-lightbox-close" title="Close">&times;</button>
			<img alt="Preview" />
			<div class="sdvn-lightbox-caption"></div>
		</div>
		<style>
			#${LIGHTBOX_ID} { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,0.85); z-index: 10000; }
			#${LIGHTBOX_ID}.visible { display: flex; }
			#${LIGHTBOX_ID} .sdvn-lightbox-backdrop { position: relative; max-width: 95vw; max-height: 95vh; display: flex; flex-direction: column; align-items: center; gap: 12px; }
			#${LIGHTBOX_ID} img { max-width: 95vw; max-height: 85vh; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); }
			#${LIGHTBOX_ID} .sdvn-lightbox-caption { color: #fff; font-size: 13px; }
			#${LIGHTBOX_ID} .sdvn-lightbox-close { position: absolute; top: -32px; right: -32px; width: 32px; height: 32px; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: #fff; font-size: 20px; cursor: pointer; }
			#${LIGHTBOX_ID} .sdvn-lightbox-close:hover { background: rgba(255,255,255,0.2); }
		</style>
	`;
	document.body.appendChild(overlay);
	overlay.addEventListener("click", (event) => {
		if (event.target === overlay || event.target.classList.contains("sdvn-lightbox-close")) {
			overlay.classList.remove("visible");
		}
	});
}

function openLightbox(path, name) {
	ensureLightbox();
	const overlay = document.getElementById(LIGHTBOX_ID);
	if (!overlay) return;
	const img = overlay.querySelector("img");
	img.src = `/local_image_gallery/view?filepath=${encodeURIComponent(path)}`;
	overlay.querySelector(".sdvn-lightbox-caption").textContent = name ?? "";
	overlay.classList.add("visible");
}

async function fetchDefaultDirectory() {
	try {
		const resp = await api.fetchApi("/local_image_gallery/default_directory");
		if (resp.ok) {
			const data = await resp.json();
			return data?.path || "";
		}
	} catch (err) {
		console.warn("SDVN.ImageGallery: default directory fallback", err);
	}
	return "";
}

app.registerExtension({
	name: "Comfy.SDVNImageGallery",
	async beforeRegisterNodeDef(nodeType, nodeData) {
		if (nodeData.name !== "SDVN ImageGallery") return;

		const originalConfigure = nodeType.prototype.configure;
		nodeType.prototype.configure = function () {
			const config = arguments[0];
			if (config?.widgets_values && Array.isArray(config.widgets_values)) {
				this.__sdvnGallerySerializedWidgets = config.widgets_values.slice();
			} else {
				this.__sdvnGallerySerializedWidgets = null;
			}
			const result = originalConfigure?.apply(this, arguments);
			if (this.onSdvnConfigure) {
				this.onSdvnConfigure();
			}
			return result;
		};

		const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
		nodeType.prototype.onNodeCreated = function () {
			const result = originalOnNodeCreated?.apply(this, arguments);
			const node = this;
			const gallery = document.createElement("div");
			gallery.className = "sdvn-gallery";
			gallery.innerHTML = `
				<style>
					.sdvn-gallery { width: 100%; height: 100%; display: flex; flex-direction: column; gap: 8px; font-family: var(--comfy-ui-font, sans-serif); --sdvn-bg: #0f0f0f; --sdvn-panel: #1a1a1a; --sdvn-border: #2a2a2a; --sdvn-text: #e0e0e0; --sdvn-muted: #a2a7c2; --sdvn-accent: #f5c518; --sdvn-accent-2: #f5c518; }
					.sdvn-toolbar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
					.sdvn-path-field { flex: 1; min-width: 220px; display: flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); height: 38px; }
					.sdvn-path-field input { flex: 1; background: transparent; border: none; color: #f8f8f8; font-size: 13px; outline: none; height: 100%; }
					.sdvn-toolbar button { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); color: var(--sdvn-text); cursor: pointer; transition: border-color 0.2s, color 0.2s; }
					.sdvn-toolbar button:hover { background: rgba(255,255,255,0.12); }
					.sdvn-toolbar button.sdvn-active { border-color: var(--sdvn-accent); color: var(--sdvn-accent); background: rgba(245, 197, 24, 0.1); }
					.sdvn-sort-group { display: inline-flex; align-items: center; gap: 4px; height: 38px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0 4px; }
					.sdvn-sort-group button { width: 30px; height: 30px; border: none; background: transparent; border-radius: 6px; }
					.sdvn-sort-group button:hover { background: rgba(255,255,255,0.1); border: none; }
					.sdvn-sort-group button.sdvn-active { background: rgba(255,255,255,0.15); color: var(--sdvn-accent); border: none; }
					.sdvn-separator { width: 1px; height: 18px; background: rgba(255,255,255,0.15); margin: 0 2px; }
					.sdvn-filter-group { flex: 1; min-width: 120px; display: flex; align-items: center; }
					.sdvn-filter-input { background: rgba(18,18,18,0.9); border: 1px solid rgba(255,255,255,0.18); border-radius: 6px; color: #f8f8f8; font-size: 12px; padding: 0 12px; height: 38px; width: 100%; }
					.sdvn-filter-input:focus { border-color: var(--sdvn-accent-2); outline: none; }
					.sdvn-folder-strip { display: flex; flex-wrap: wrap; gap: 10px; padding: 4px 2px; overflow-x: auto; }
					.sdvn-folder-strip .sdvn-card { width: 150px; margin-bottom: 0; }
					.sdvn-gallery-grid { flex: 1; overflow-y: auto; overflow-x: hidden; column-gap: 14px; padding-right: 4px; column-width: 190px; }
					@media (min-width: 720px) { .sdvn-gallery-grid { column-width: 200px; } }
					@media (min-width: 1024px) { .sdvn-gallery-grid { column-width: 220px; } }
					.sdvn-card { border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); color: #dfe3f0; cursor: pointer; padding: 8px; display: inline-flex; width: 100%; flex-direction: column; gap: 6px; transition: border-color 0.2s, transform 0.1s; margin-bottom: 12px; break-inside: avoid; box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
					.sdvn-card:hover { border-color: rgba(255,255,255,0.35); }
					.sdvn-card.sdvn-selected { border-color: var(--sdvn-accent); border-width: 2px; box-shadow: none; }
					.sdvn-card .sdvn-thumb { width: 100%; border-radius: 8px; overflow: hidden; background: rgba(255,255,255,0.04); }
					.sdvn-card .sdvn-thumb img { display: block; width: 100%; height: auto; }
					.sdvn-card .sdvn-card-name { display: none; }
					.sdvn-card.sdvn-folder { align-items: center; justify-content: center; min-height: 120px; text-align: center; gap: 8px; background: rgba(255,255,255,0.04); }
					.sdvn-folder-icon { width: 100%; display: flex; justify-content: center; }
					.sdvn-card.sdvn-folder .sdvn-card-name { display: block; font-size: 11px; color: #cdd3f8; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.85; }
					.sdvn-card.sdvn-folder svg { opacity: 0.85; width: 48px; height: 48px; }
					.sdvn-footer { display: flex; align-items: center; justify-content: space-between; font-size: 12px; gap: 8px; }
					.sdvn-footer button { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: rgba(10,10,10,0.9); color: var(--sdvn-text); cursor: pointer; font-size: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.35); }
					.sdvn-footer button:hover { background: rgba(255,255,255,0.08); }
					.sdvn-gallery.sdvn-drop-active { outline: 2px dashed var(--sdvn-accent); outline-offset: 4px; }
					.sdvn-gallery.sdvn-uploading .sdvn-gallery-grid,
					.sdvn-gallery.sdvn-uploading .sdvn-folder-strip { opacity: 0.5; pointer-events: none; }
				</style>
				<div class="sdvn-toolbar">
					<div class="sdvn-path-field">
						<span style="display:flex;">${ICONS.folder}</span>
						<input type="text" class="sdvn-path-input" placeholder="Select folder" />
					</div>
					<button type="button" data-action="up" title="Parent">${ICONS.up}</button>
					<button type="button" data-action="refresh" title="Refresh">${ICONS.reset}</button>
					<button type="button" data-action="toggle-folders" title="Toggle subfolders">${ICONS.folders}</button>
					<div class="sdvn-sort-group">
						<button type="button" data-sort="name" title="Sort by Name">${ICONS.sortName}</button>
						<button type="button" data-sort="date" title="Sort by Date">${ICONS.sortDate}</button>
						<button type="button" data-sort="size" title="Sort by Size">${ICONS.sortSize}</button>
						<div class="sdvn-separator"></div>
						<button type="button" data-action="toggle-order" title="Toggle sort order">${ICONS.sortAsc}</button>
					</div>
					<div class="sdvn-filter-group">
						<input class="sdvn-filter-input" placeholder="Name filter" />
					</div>
				</div>
				<div class="sdvn-folder-strip"></div>
				<div class="sdvn-gallery-grid"></div>
				<div class="sdvn-footer">
					<div class="sdvn-selection-label">No image selected</div>
					<div style="display:flex; gap:6px; flex-wrap: wrap;">
						<button type="button" data-action="preview" title="Preview selection">${ICONS.zoom}</button>
						<button type="button" data-action="edit-image" title="Edit in Image Editor">Image Editor</button>
						<button type="button" data-action="delete" title="Delete selected images">Delete</button>
						<button type="button" data-action="load-more">Load more</button>
					</div>
				</div>
			`;

			node.addDOMWidget("sdvn_gallery", "div", gallery, {});
			if (node.size) {
				node.size[0] = Math.max(node.size[0] || 360, 360);
				node.size[1] = Math.max(node.size[1] || 500, 500);
			}

			const pathWidget = node.widgets?.find((w) => w.name === "current_directory");
			if (pathWidget) {
				pathWidget.hidden = true;
				pathWidget.computeSize = () => [0, 0];
			}

			const selectionWidget = node.widgets?.find((w) => w.name === "selected_paths");
			if (selectionWidget) {
				selectionWidget.hidden = true;
				selectionWidget.computeSize = () => [0, 0];
			}

			const getWidgetStoredValue = (widget) => {
				if (!widget) return "";
				const idx = node.widgets?.indexOf?.(widget) ?? -1;
				if (idx >= 0) {
					if (Array.isArray(node.__sdvnGallerySerializedWidgets) && node.__sdvnGallerySerializedWidgets.length > idx) {
						const serialized = node.__sdvnGallerySerializedWidgets[idx];
						if (serialized !== undefined && serialized !== null) return serialized;
					}
					if (Array.isArray(node.widgets_values) && node.widgets_values.length > idx) {
						const stored = node.widgets_values[idx];
						if (stored !== undefined && stored !== null) return stored;
					}
				}
				return widget.value ?? "";
			};

			const parseSelectionList = (raw) => {
				if (!raw) return [];
				if (Array.isArray(raw)) return raw.filter((entry) => typeof entry === "string");
				if (typeof raw === "string") {
					const trimmed = raw.trim();
					if (!trimmed) return [];
					try {
						const parsed = JSON.parse(trimmed);
						if (Array.isArray(parsed)) return parsed.filter((entry) => typeof entry === "string");
					} catch (err) {
						// Fallback to newline-separated paths
						return trimmed
							.split(/\r?\n/)
							.map((entry) => entry.trim())
							.filter((entry) => !!entry);
					}
				}
				return [];
			};

			const storedPathRaw = getWidgetStoredValue(pathWidget);
			const storedPathValue = typeof storedPathRaw === "string" ? storedPathRaw.trim() : "";
			const initialSelectionPaths = parseSelectionList(getWidgetStoredValue(selectionWidget));
			let widgetSelectionTargets = new Set(initialSelectionPaths);
			let needsWidgetSelectionRestore = widgetSelectionTargets.size > 0;
			let defaultDirectory = "";
			let filterDebounce;

			const state = {
				path: storedPathValue,
				page: 1,
				totalPages: 1,
				items: [],
				selection: [],
				sortBy: "name",
				sortOrder: "asc",
				filterTag: "",
				parentDirectory: "",
				loading: false,
				showFolders: true,
				cacheBust: Date.now(),
			};

			const pathInput = gallery.querySelector(".sdvn-path-input");
			const folderStrip = gallery.querySelector(".sdvn-folder-strip");
			const grid = gallery.querySelector(".sdvn-gallery-grid");
			const selectionLabel = gallery.querySelector(".sdvn-selection-label");
			const loadMoreButton = gallery.querySelector('[data-action="load-more"]');
			loadMoreButton.style.display = "none";
			// const sortBySelect = gallery.querySelector(".sdvn-sort-by");
			const sortButtons = gallery.querySelectorAll('[data-sort]');
			const sortOrderButton = gallery.querySelector('[data-action="toggle-order"]');
			const filterInput = gallery.querySelector(".sdvn-filter-input");
			const previewButton = gallery.querySelector('[data-action="preview"]');
			const editButton = gallery.querySelector('[data-action="edit-image"]');
			const deleteButton = gallery.querySelector('[data-action="delete"]');
			const toggleFoldersButton = gallery.querySelector('[data-action="toggle-folders"]');

			const syncSelectionWidget = () => {
				if (!selectionWidget) return;
				const payload = JSON.stringify(state.selection.map((item) => item.path));
				if (selectionWidget.value === payload) return;
				selectionWidget.value = payload;
				selectionWidget.callback?.(payload);
				if (!Array.isArray(node.widgets_values)) {
					node.widgets_values = node.widgets?.map((w) => w.value ?? null) ?? [];
				}
				const idx = node.widgets?.indexOf?.(selectionWidget) ?? -1;
				if (idx >= 0) node.widgets_values[idx] = payload;
			};

			const syncPathWidget = (value) => {
				if (!pathWidget) return;
				const normalized = typeof value === "string" ? value : "";
				if (pathWidget.value === normalized) return;
				pathWidget.value = normalized;
				pathWidget.callback?.(normalized);
				if (!Array.isArray(node.widgets_values)) {
					node.widgets_values = node.widgets?.map((w) => w.value ?? null) ?? [];
				}
				const idx = node.widgets?.indexOf?.(pathWidget) ?? -1;
				if (idx >= 0) node.widgets_values[idx] = normalized;
			};

			const getImageSelection = () => state.selection.filter((item) => item.type === "image");
			const getPrimaryImageSelection = () => getImageSelection()[0] || null;

			const hasSupportedExtension = (name) => {
				if (!name) return false;
				const lower = name.toLowerCase();
				return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
			};

			const updateActionButtons = () => {
				const hasImageSelection = getImageSelection().length > 0;
				if (previewButton) previewButton.disabled = !hasImageSelection;
				if (editButton) editButton.disabled = !hasImageSelection;
				if (deleteButton) deleteButton.disabled = !hasImageSelection;
			};

			const updateSelectionLabel = () => {
				const folderName = state.path ? state.path.split(/[/\\\\]/).filter(Boolean).pop() : "";
				if (!state.selection.length) {
					selectionLabel.textContent = folderName ? `Folder: ${folderName}` : "Folder: Input";
				} else if (state.selection.length === 1) {
					selectionLabel.textContent = `Selected: ${state.selection[0].name}`;
				} else {
					selectionLabel.textContent = `${state.selection.length} images selected`;
				}
				updateActionButtons();
			};

			const setPathValue = (value) => {
				const normalized = typeof value === "string" ? value.trim() : "";
				state.path = normalized;
				if (pathInput && pathInput.value !== normalized) {
					pathInput.value = normalized;
				}
				syncPathWidget(normalized);
				updateSelectionLabel();
			};

			const updateCardSelection = () => {
				const selectedPaths = new Set(state.selection.map((item) => item.path));
				grid.querySelectorAll(".sdvn-card").forEach((card) => {
					card.classList.toggle("sdvn-selected", selectedPaths.has(card.dataset.path));
				});
			};

			const applySelection = (items) => {
				state.selection = items;
				updateSelectionLabel();
				updateCardSelection();
				syncSelectionWidget();
			};

			const clearSelection = () => {
				applySelection([]);
				needsWidgetSelectionRestore = false;
				widgetSelectionTargets.clear();
			};

			const selectItem = (item, additive) => {
				let nextSelection = [];
				if (!additive) {
					nextSelection = [item];
				} else {
					const exists = state.selection.findIndex((entry) => entry.path === item.path);
					if (exists > -1) {
						nextSelection = state.selection.filter((entry) => entry.path !== item.path);
					} else {
						nextSelection = state.selection.concat(item);
					}
				}
				applySelection(nextSelection);
				needsWidgetSelectionRestore = false;
				widgetSelectionTargets.clear();
			};

			const setFolderStripVisibility = () => {
				if (folderStrip) folderStrip.style.display = state.showFolders ? "" : "none";
				if (toggleFoldersButton) toggleFoldersButton.classList.toggle("sdvn-active", state.showFolders);
			};
			setFolderStripVisibility();
			setPathValue(state.path);

			const createCard = (item) => {
				const card = document.createElement("div");
				card.className = `sdvn-card ${item.type === "dir" ? "sdvn-folder" : ""}`;
				card.dataset.path = item.path;
				card.title = item.name;
				if (item.type === "dir") {
					card.innerHTML = `<div class="sdvn-folder-icon">${ICONS.folder}</div><div class="sdvn-card-name">${item.name}</div>`;
					card.addEventListener("click", () => {
						if (item.path === state.path) return;
						setPathValue(item.path || "");
						clearSelection();
						state.page = 1;
						loadImages(false);
					});
				} else {
					card.innerHTML = `
						<div class="sdvn-thumb">
							<img src="/local_image_gallery/thumbnail?filepath=${encodeURIComponent(item.path)}&t=${state.cacheBust}" loading="lazy" alt="${item.name}" />
						</div>
					`;
					card.addEventListener("click", (event) => {
						selectItem(item, event.metaKey || event.ctrlKey);
					});
					card.addEventListener("dblclick", () => openLightbox(item.path, item.name));
				}
				return card;
			};

			const refreshSelectionBindings = () => {
				if (!state.selection.length) return;
				const pathToItem = new Map(state.items.map((entry) => [entry.path, entry]));
				let changed = false;
				const rebound = state.selection.map((selected) => {
					const updated = pathToItem.get(selected.path);
					if (updated && updated !== selected) {
						changed = true;
						return updated;
					}
					return selected;
				});
				state.selection = rebound;
				if (changed) {
					updateSelectionLabel();
					syncSelectionWidget();
				}
			};

			const restoreSelectionFromWidget = () => {
				if (!needsWidgetSelectionRestore || !widgetSelectionTargets.size) return;
				const matches = state.items.filter((item) => widgetSelectionTargets.has(item.path));
				if (!matches.length) return;
				const existingPaths = new Set(state.selection.map((item) => item.path));
				const merged = state.selection.slice();
				matches.forEach((match) => {
					if (!existingPaths.has(match.path)) merged.push(match);
					widgetSelectionTargets.delete(match.path);
				});
				applySelection(merged);
				if (!widgetSelectionTargets.size) needsWidgetSelectionRestore = false;
			};

			const renderItems = (items, append) => {
				if (!append) {
					grid.innerHTML = "";
					folderStrip.innerHTML = "";
				}
				const folders = [];
				const files = [];
				items.forEach((item) => {
					if (item.type === "dir") folders.push(item);
					else files.push(item);
				});
				folders.forEach((item) => folderStrip.appendChild(createCard(item)));
				files.forEach((item) => grid.appendChild(createCard(item)));
				refreshSelectionBindings();
				restoreSelectionFromWidget();
				updateCardSelection();
			};

			const setLoadingState = (isLoading) => {
				state.loading = isLoading;
				const opacity = isLoading ? "0.5" : "1";
				if (grid) grid.style.opacity = opacity;
				if (folderStrip) folderStrip.style.opacity = opacity;
			};

			const loadImages = async (append) => {
				if (state.loading) return;
				setLoadingState(true);
				try {
					const params = new URLSearchParams({
						directory: state.path,
						page: String(append ? state.page + 1 : 1),
						sort_by: state.sortBy,
						sort_order: state.sortOrder,
						filter_tag: state.filterTag,
					});
					const resp = await api.fetchApi(`/local_image_gallery/images?${params.toString()}`);
					if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
					const data = await resp.json();
					const resolvedPath = data.current_directory || state.path;
					setPathValue(resolvedPath);
					state.parentDirectory = data.parent_directory || "";
					state.page = data.current_page;
					state.totalPages = data.total_pages;
					state.cacheBust = Date.now();
					state.items = append ? state.items.concat(data.items) : data.items;
					renderItems(data.items, append);
					if (state.page >= state.totalPages) {
						loadMoreButton.style.display = "none";
					} else {
						loadMoreButton.style.display = "inline-flex";
						loadMoreButton.disabled = false;
						loadMoreButton.textContent = "Load more";
					}
				} catch (err) {
					grid.innerHTML = `<div style="color:#ff9b9b;">${err.message}</div>`;
				} finally {
					setLoadingState(false);
				}
			};

			const previewSelectedImage = () => {
				const target = getPrimaryImageSelection();
				if (!target) return;
				openLightbox(target.path, target.name);
			};

			const openSelectedInEditor = () => {
				const target = getPrimaryImageSelection();
				if (!target) return;
				const src = `/local_image_gallery/view?filepath=${encodeURIComponent(target.path)}`;
				new ImageEditor(src, async (blob) => {
					const formData = new FormData();
					formData.append("path", target.path);
					formData.append("image", blob, target.name || "edited-image.png");
					try {
						const resp = await api.fetchApi("/local_image_gallery/save_image", {
							method: "POST",
							body: formData,
						});
						let data = {};
						try {
							data = await resp.json();
						} catch (err) {
							console.warn("SDVN.ImageGallery: save_image parse", err);
						}
						if (!resp.ok || data?.status !== "ok") {
							const reason = data?.message || resp.statusText || "Failed to save image";
							throw new Error(reason);
						}
						await loadImages(false);
					} catch (err) {
						alert(`Save failed: ${err.message}`);
					}
				});
			};

			const deleteSelectedImages = async () => {
				const targets = getImageSelection();
				if (!targets.length) {
					alert("Select at least one image to delete.");
					return;
				}
				if (!state.path) {
					alert("Choose a folder before deleting images.");
					return;
				}
				// const confirmMessage = targets.length === 1 ? `Delete ${targets[0].name}?` : `Delete ${targets.length} images?`;
				// if (!window.confirm(confirmMessage)) return;
				if (deleteButton) deleteButton.disabled = true;
				try {
					const resp = await api.fetchApi("/local_image_gallery/delete", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ paths: targets.map((item) => item.path) }),
					});
					let data = {};
					try {
						data = await resp.json();
					} catch (err) {
						console.warn("SDVN.ImageGallery: delete parse", err);
					}
					if (!resp.ok || data?.status !== "ok") {
						const reason =
							data?.message ||
							(Array.isArray(data?.errors) ? data.errors.join(", ") : null) ||
							resp.statusText ||
							"Failed to delete images";
						throw new Error(reason);
					}
					clearSelection();
					await loadImages(false);
				} catch (err) {
					alert(`Delete failed: ${err.message}`);
				} finally {
					if (deleteButton) deleteButton.disabled = false;
					updateActionButtons();
				}
			};

				const uploadFilesToCurrentDirectory = async (files) => {
					if (!files.length || !state.path) return;
					gallery.classList.add("sdvn-uploading");
					try {
						const formData = new FormData();
						formData.append("directory", state.path);
						files.forEach((file) => formData.append("image", file, file.name));
						const resp = await api.fetchApi("/local_image_gallery/upload", {
							method: "POST",
							body: formData,
						});
						let data = {};
						try {
							data = await resp.json();
						} catch (err) {
							console.warn("SDVN.ImageGallery: upload parse", err);
						}
						if (!resp.ok || data?.status !== "ok") {
							const reason =
								data?.message ||
								(Array.isArray(data?.errors) ? data.errors.filter(Boolean).join(", ") : null) ||
								resp.statusText ||
								"Upload failed";
							throw new Error(reason);
						}
						clearSelection();
						await loadImages(false);
					} catch (err) {
						alert(`Upload failed: ${err.message}`);
					} finally {
						gallery.classList.remove("sdvn-uploading");
					}
				};

				let dragDepth = 0;
				const isFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes("Files");
				const setDropHighlight = (active) => {
					gallery.classList.toggle("sdvn-drop-active", !!active);
				};

			gallery.querySelector('[data-action="refresh"]').addEventListener("click", async () => {
				if (filterInput) filterInput.value = "";
				state.filterTag = "";
				state.sortBy = "name";
				updateSortUI();
				state.sortOrder = "asc";
				if (sortOrderButton) sortOrderButton.innerHTML = ICONS.sortAsc;
				state.page = 1;
				if (defaultDirectory) {
					setPathValue(defaultDirectory);
				}
				clearSelection();
				await loadImages(false);
			});

			gallery.querySelector('[data-action="up"]').addEventListener("click", () => {
				if (!state.parentDirectory) return;
				setPathValue(state.parentDirectory || "");
				clearSelection();
				state.page = 1;
				loadImages(false);
			});

			if (toggleFoldersButton) {
				toggleFoldersButton.addEventListener("click", () => {
					state.showFolders = !state.showFolders;
					setFolderStripVisibility();
				});
			}

			const updateSortUI = () => {
				sortButtons.forEach(btn => {
					btn.classList.toggle("sdvn-active", btn.dataset.sort === state.sortBy);
				});
			};

			sortButtons.forEach(btn => {
				btn.addEventListener("click", () => {
					const sortType = btn.dataset.sort;
					if (state.sortBy === sortType) return;
					state.sortBy = sortType;
					updateSortUI();
					state.page = 1;
					loadImages(false);
				});
			});
			updateSortUI();

			sortOrderButton.addEventListener("click", () => {
				state.sortOrder = state.sortOrder === "asc" ? "desc" : "asc";
				sortOrderButton.innerHTML = state.sortOrder === "asc" ? ICONS.sortAsc : ICONS.sortDesc;
				state.page = 1;
				loadImages(false);
			});

			if (filterInput) {
				const applyFilterValue = () => {
					const nextFilter = filterInput.value.trim().toLowerCase();
					if (nextFilter === state.filterTag) return;
					state.filterTag = nextFilter;
					state.page = 1;
					loadImages(false);
				};
				filterInput.addEventListener("input", () => {
					clearTimeout(filterDebounce);
					filterDebounce = setTimeout(applyFilterValue, 400);
				});
				filterInput.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						clearTimeout(filterDebounce);
						applyFilterValue();
					}
				});
			}

			if (pathInput) {
				pathInput.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						const targetPath = pathInput.value;
						setPathValue(targetPath);
						clearSelection();
						state.page = 1;
						loadImages(false);
					}
				});
			}

			loadMoreButton.addEventListener("click", () => {
				if (state.page < state.totalPages) {
					loadImages(true);
				}
			});

			if (previewButton) previewButton.addEventListener("click", previewSelectedImage);
			if (editButton) editButton.addEventListener("click", openSelectedInEditor);
			if (deleteButton) deleteButton.addEventListener("click", deleteSelectedImages);

			const handleDragOver = (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				event.dataTransfer.dropEffect = "copy";
			};

			const handleDragEnter = (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				dragDepth += 1;
				setDropHighlight(true);
			};

			const handleDragLeave = (event) => {
				if (!isFileDrag(event)) return;
				event.stopPropagation();
				dragDepth = Math.max(0, dragDepth - 1);
				if (dragDepth === 0) setDropHighlight(false);
			};

			const handleDrop = async (event) => {
				if (!isFileDrag(event)) return;
				event.preventDefault();
				event.stopPropagation();
				dragDepth = 0;
				setDropHighlight(false);
				if (!event.dataTransfer) return;
				if (!state.path) {
					alert("Select a folder before uploading images.");
					return;
				}
				if (gallery.classList.contains("sdvn-uploading")) return;
				const candidates = Array.from(event.dataTransfer.files || []);
				const accepted = candidates.filter((file) => hasSupportedExtension(file.name));
				if (!accepted.length) {
					alert("No supported image formats found in dropped files.");
					return;
				}
				await uploadFilesToCurrentDirectory(accepted);
			};

			gallery.addEventListener("dragover", handleDragOver);
			gallery.addEventListener("dragenter", handleDragEnter);
			gallery.addEventListener("dragleave", handleDragLeave);
			gallery.addEventListener("drop", handleDrop);

			const init = async () => {
				try {
					const fetchedDefault = await fetchDefaultDirectory();
					defaultDirectory = fetchedDefault || defaultDirectory || "";
				} catch (err) {
					console.warn("SDVN.ImageGallery: Failed to fetch default directory", err);
				}
				if (!defaultDirectory) defaultDirectory = state.path || "";
				if (!state.path) {
					setPathValue(defaultDirectory);
				} else {
					setPathValue(state.path);
				}
				await loadImages(false);
			};

			node.onSdvnConfigure = () => {
				const storedPathRaw = getWidgetStoredValue(pathWidget);
				const storedPathValue = typeof storedPathRaw === "string" ? storedPathRaw.trim() : "";
				if (storedPathValue) {
					setPathValue(storedPathValue);
				}

				const initialSelectionPaths = parseSelectionList(getWidgetStoredValue(selectionWidget));
				if (initialSelectionPaths.length > 0) {
					widgetSelectionTargets = new Set(initialSelectionPaths);
					needsWidgetSelectionRestore = true;
				}

				if (state.path) {
					state.page = 1;
					loadImages(false);
				}
			};

			init();
			ensureLightbox();
			return result;
		};
	},
});
