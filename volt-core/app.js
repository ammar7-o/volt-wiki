
    class VoltMDCore {
        constructor(options = {}) {
            this.options = {
                jsonUrl: options.jsonUrl || 'volt-core/base.js',
                baseUrl: options.baseUrl || '',
                theme: localStorage.getItem('volt-md-theme') || 'dark',
                ...options
            };
            
            this.fileTree = null;
            this.allFiles = [];
            this.allFilesContent = {};
            this.currentFile = null;
            this.currentContent = '';
            this.currentHtml = '';
            this.searchMatches = [];
            this.currentSearchIndex = -1;
            this.contentSearchMatches = [];
            this.contentSearchIndex = -1;
            this.fileLinks = new Map();
            this.scrollPositions = {};
            
            this.settings = {
                syntaxHighlight: true,
                copyCode: true,
                autoRtl: true
            };
            
            this.initMermaid();
            this.loadState();
            this.init();
        }
        
        async init() {
            this.applyTheme(this.options.theme);
            this.bindEvents();
            this.bindKeyboardShortcuts();
            
            await this.loadTree();
            await this.loadAllFileContents();
            this.buildFileLinks();
            this.initSyntaxHighlighting();
            this.initGraph();
            this.initMermaid();
            
            const urlFile = this.getUrlFile();
            
            if (urlFile) {
                setTimeout(() => {
                    const file = this.allFiles.find(f => f.path === urlFile.path || f.name === urlFile.name || f.path.endsWith(urlFile.name));
                    if (file) {
                        this.loadFile(file.path, file.name);
                    } else {
                        this.loadFile(urlFile.path, urlFile.name);
                    }
                }, 50);
            } else if (this.savedState.currentFile) {
                const savedPath = this.savedState.currentFile.path;
                const savedName = this.savedState.currentFile.name;
                const fileExists = this.allFiles.some(f => f.path === savedPath || f.name === savedName);
                
                if (fileExists) {
                    this.loadFile(savedPath, savedName);
                } else {
                    this.savedState.currentFile = null;
                    this.saveState();
                }
            }
            
            if (this.savedState.sidebarCollapsed) {
                document.getElementById('sidebar').classList.add('collapsed');
            }
            
            if (this.savedState.tocCollapsed) {
                document.getElementById('toc-sidebar').classList.add('collapsed');
            }
            
            document.getElementById('sidebar-theme-toggle').checked = this.options.theme === 'dark';
        }
        
        loadState() {
            const saved = localStorage.getItem('volt-md-state');
            this.savedState = saved ? JSON.parse(saved) : {
                currentFile: null,
                sidebarCollapsed: false,
                tocCollapsed: false,
                theme: 'dark',
                expandedFolders: [],
                scrollPositions: {}
            };
        }
        
        saveState() {
            const sidebar = document.getElementById('sidebar');
            const tocSidebar = document.querySelector('.toc-sidebar');
            const expandedFolders = [];
            
            document.querySelectorAll('.tree-folder.expanded').forEach(folder => {
                expandedFolders.push(folder.textContent.trim());
            });
            
            const state = {
                currentFile: this.currentFile,
                sidebarCollapsed: sidebar ? sidebar.classList.contains('collapsed') : false,
                tocCollapsed: tocSidebar ? tocSidebar.classList.contains('collapsed') : false,
                theme: this.options.theme,
                expandedFolders: expandedFolders,
                scrollPositions: {}
            };
            localStorage.setItem('volt-md-state', JSON.stringify(state));
        }
        
        applyTheme(theme) {
            document.documentElement.setAttribute('data-theme', theme);
            this.options.theme = theme;
            localStorage.setItem('volt-md-theme', theme);
            
            const sidebarToggle = document.getElementById('sidebar-theme-toggle');
            if (sidebarToggle) {
                sidebarToggle.checked = theme === 'dark';
            }
        }
        
        toggleTheme() {
            const newTheme = this.options.theme === 'light' ? 'dark' : 'light';
            this.applyTheme(newTheme);
            this.saveState();
        }
        
        bindEvents() {
            document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
                this.toggleSidebar();
                this.saveState();
            });
            
            document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
                const sidebar = document.getElementById('sidebar');
                sidebar?.classList.add('collapsed');
                document.getElementById('sidebar-overlay')?.classList.remove('active');
                this.saveState();
            });
            
            document.getElementById('sidebar-close')?.addEventListener('click', () => {
                document.getElementById('sidebar').classList.add('collapsed');
                this.saveState();
            });
            
            document.getElementById('toc-toggle')?.addEventListener('click', () => {
                this.toggleToc();
                this.saveState();
            });
            
            document.getElementById('right-sidebar-collapse')?.addEventListener('click', () => {
                document.getElementById('toc-sidebar').classList.add('collapsed');
                this.saveState();
            });
            
            document.getElementById('sidebar-theme-toggle')?.addEventListener('change', (e) => {
                this.applyTheme(e.target.checked ? 'dark' : 'light');
                this.saveState();
            });
            
            document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
                this.toggleTheme();
            });
            
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.searchFiles(e.target.value));
            }
            
            const contentSearchInput = document.getElementById('content-search-input');
            if (contentSearchInput) {
                contentSearchInput.addEventListener('input', (e) => this.searchContent(e.target.value));
                contentSearchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.nextContentMatch();
                    }
                });
            }
            
            document.getElementById('tree-collapse-all')?.addEventListener('click', () => {
                this.collapseAllFolders();
            });

            document.getElementById('reveal-current-file')?.addEventListener('click', () => {
                this.revealCurrentFile();
            });
            
            document.getElementById('float-overlay')?.addEventListener('click', () => {
                this.closeFloatWindow();
            });
            
            document.getElementById('float-close')?.addEventListener('click', () => {
                this.closeFloatWindow();
            });
            
            document.querySelectorAll('.sidebar-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    const tabName = tab.dataset.sidebarTab;
                    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    document.getElementById(`panel-${tabName}`)?.classList.add('active');
                });
            });
            
            document.getElementById('setting-primary-color')?.addEventListener('input', (e) => {
                const color = e.target.value;
                document.getElementById('primary-color-value').textContent = color;
                document.documentElement.style.setProperty('--primary-color', color);
                document.documentElement.style.setProperty('--accent-color', color);
                localStorage.setItem('volt-md-primary-color', color);
            });
            
            document.getElementById('setting-font-size')?.addEventListener('change', (e) => {
                const size = e.target.value;
                document.documentElement.style.setProperty('--font-size', size + 'px');
                localStorage.setItem('volt-md-font-size', size);
            });
            
            document.getElementById('setting-font-weight')?.addEventListener('change', (e) => {
                const weight = e.target.value;
                document.documentElement.style.setProperty('--font-weight', weight);
                localStorage.setItem('volt-md-font-weight', weight);
            });
            
            document.querySelectorAll('.theme-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const theme = btn.dataset.theme;
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.applyTheme(theme);
                    this.saveState();
                });
            });

            document.getElementById('setting-font-family')?.addEventListener('change', (e) => {
                const fontFamily = e.target.value;
                document.documentElement.style.setProperty('--font-family', fontFamily);
                localStorage.setItem('volt-md-font-family', fontFamily);
            });

            document.getElementById('export-pdf-btn')?.addEventListener('click', () => {
                window.print();
            });

            document.getElementById('reset-settings-btn')?.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all settings to default?')) {
                    localStorage.removeItem('volt-md-font-size');
                    localStorage.removeItem('volt-md-font-weight');
                    localStorage.removeItem('volt-md-font-family');
                    localStorage.removeItem('volt-md-primary-color');
                    localStorage.removeItem('volt-md-theme');
                    localStorage.removeItem('volt-md-custom-js');
                    localStorage.removeItem('volt-md-graph-positions');
                    
                    document.documentElement.style.setProperty('--font-size', '16px');
                    document.documentElement.style.setProperty('--font-weight', '400');
                    document.documentElement.style.setProperty('--font-family', '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
                    document.documentElement.style.setProperty('--primary-color', '#228be6');
                    document.documentElement.style.setProperty('--accent-color', '#228be6');
                    
                    document.getElementById('setting-font-size').value = '16';
                    document.getElementById('setting-font-weight').value = '400';
                    document.getElementById('setting-font-family').value = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                    document.getElementById('setting-primary-color').value = '#228be6';
                    document.getElementById('primary-color-value').textContent = '#228be6';
                    document.getElementById('setting-custom-js').value = '';
                    
                    this.applyTheme('dark');
                    document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                    document.querySelector('.theme-btn[data-theme="dark"]')?.classList.add('active');

                    this.graphNodePositions = {};
                    this.redrawGraph();
                }
            });

            document.getElementById('save-custom-js-btn')?.addEventListener('click', () => {
                const customJs = document.getElementById('setting-custom-js').value;
                localStorage.setItem('volt-md-custom-js', customJs);
                this.executeCustomJs(customJs);
                alert('Custom JS saved and executed!');
            });

            this.loadUserSettings();

            const savedCustomJs = localStorage.getItem('volt-md-custom-js');
            if (savedCustomJs) {
                document.getElementById('setting-custom-js').value = savedCustomJs;
                this.executeCustomJs(savedCustomJs);
            }

            const contentWrapper = document.querySelector('.content-wrapper');
            if (contentWrapper) {
                let scrollTimeout;
                contentWrapper.addEventListener('scroll', () => {
                    clearTimeout(scrollTimeout);
                    scrollTimeout = setTimeout(() => {
                        if (this.currentFile && this.currentFile.path) {
                            this.scrollPositions[this.currentFile.path] = contentWrapper.scrollTop;
                            this.saveScrollPosition(this.currentFile.path, contentWrapper.scrollTop);
                        }
                    }, 300);
                });
            }
        }

        saveScrollPosition(filePath, scrollTop) {
            const positions = JSON.parse(localStorage.getItem('volt-md-scroll-positions') || '{}');
            positions[filePath] = scrollTop;
            localStorage.setItem('volt-md-scroll-positions', JSON.stringify(positions));
        }

        getScrollPosition(filePath) {
            const positions = JSON.parse(localStorage.getItem('volt-md-scroll-positions') || '{}');
            return positions[filePath] || 0;
        }
        
        loadUserSettings() {
            const savedColor = localStorage.getItem('volt-md-primary-color');
            if (savedColor) {
                document.getElementById('setting-primary-color').value = savedColor;
                document.getElementById('primary-color-value').textContent = savedColor;
                document.documentElement.style.setProperty('--primary-color', savedColor);
                document.documentElement.style.setProperty('--accent-color', savedColor);
            }
            
            const savedSize = localStorage.getItem('volt-md-font-size');
            if (savedSize) {
                document.getElementById('setting-font-size').value = savedSize;
                document.documentElement.style.setProperty('--font-size', savedSize + 'px');
            }
            
            const savedWeight = localStorage.getItem('volt-md-font-weight');
            if (savedWeight) {
                document.getElementById('setting-font-weight').value = savedWeight;
                document.documentElement.style.setProperty('--font-weight', savedWeight);
            }

            const savedFontFamily = localStorage.getItem('volt-md-font-family');
            if (savedFontFamily) {
                document.getElementById('setting-font-family').value = savedFontFamily;
                document.documentElement.style.setProperty('--font-family', savedFontFamily);
            }
            
            const savedLineNumbers = localStorage.getItem('volt-md-line-numbers');
            if (savedLineNumbers) {
                const el = document.getElementById('setting-line-numbers');
                if (el) el.checked = savedLineNumbers === 'true';
            }
            
            const savedReadTime = localStorage.getItem('volt-md-read-time');
            if (savedReadTime !== null) {
                const el = document.getElementById('setting-read-time');
                if (el) el.checked = savedReadTime !== 'false';
            }
            
            const savedWordCount = localStorage.getItem('volt-md-word-count');
            if (savedWordCount !== null) {
                const el = document.getElementById('setting-word-count');
                if (el) el.checked = savedWordCount !== 'false';
            }
        }
        
        bindKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    e.preventDefault();
                    document.getElementById('content-search-input')?.focus();
                }
                
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.toggleSidebar();
                    this.saveState();
                }
                
                if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                    e.preventDefault();
                    this.toggleTheme();
                }
                
                if (e.key === 'Escape') {
                    document.getElementById('content-search-input').value = '';
                    document.getElementById('search-input').value = '';
                    this.clearContentSearch();
                    this.clearFileSearch();
                    this.closeFloatWindow();
                }
            });
        }
        
        toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            const isMobile = window.innerWidth <= 768;
            
            sidebar?.classList.toggle('collapsed');
            
            if (isMobile) {
                if (sidebar?.classList.contains('collapsed')) {
                    overlay?.classList.remove('active');
                } else {
                    overlay?.classList.add('active');
                }
            }
        }
        
        toggleToc() {
            document.getElementById('toc-sidebar')?.classList.toggle('collapsed');
        }

        collapseAllFolders() {
            const folders = document.querySelectorAll('.tree-folder');
            const anyExpanded = Array.from(folders).some(folder => folder.classList.contains('expanded'));
            
            folders.forEach(folder => {
                folder.classList.toggle('expanded', !anyExpanded);
                const children = folder.nextElementSibling;
                if (children) {
                    children.classList.toggle('expanded', !anyExpanded);
                }
            });
            this.saveState();
        }

        revealCurrentFile() {
            if (!this.currentFile) return;

            const currentFileEl = document.querySelector(`.tree-file[data-path="${CSS.escape(this.currentFile.path)}"]`);
            if (!currentFileEl) return;

            let folder = currentFileEl.closest('.tree-folder-children');
            while (folder) {
                const folderEl = folder.previousElementSibling;
                if (folderEl && folderEl.classList.contains('tree-folder')) {
                    folderEl.classList.add('expanded');
                    folder.classList.add('expanded');
                }
                folder = folder.parentElement?.closest('.tree-folder-children');
            }

            const fileTree = document.getElementById('file-tree');
            if (fileTree) {
                const scrollContainer = fileTree.parentElement;
                if (scrollContainer) {
                    const containerRect = scrollContainer.getBoundingClientRect();
                    const fileRect = currentFileEl.getBoundingClientRect();
                    const scrollTop = fileRect.top - containerRect.top + scrollContainer.scrollTop - 50;
                    scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' });
                }
            }

currentFileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        async loadTree() {
            if (window.__fileTree) {
                this.fileTree = window.__fileTree.tree[0];
                this.renderFileTree();
            } else {
                try {
                    const url = this.options.baseUrl + this.options.jsonUrl;
                    const response = await fetch(url);
                    const data = await response.json();
                    this.fileTree = data.tree[0];
                    this.renderFileTree();
                } catch (error) {
                    console.error('Error loading file tree:', error);
                }
            }
        }
        
        async loadAllFileContents() {
            const files = this.getAllFiles(this.fileTree);
            for (const file of files) {
                try {
                    const content = await this.loadFromScript(file.path);
                    this.allFilesContent[file.path] = content;
                    this.allFiles.push(file);
                } catch (error) {
                    console.warn(`Error loading ${file.path}:`, error);
                }
            }
        }

        loadFromScript(filePath) {
            return new Promise((resolve, reject) => {
                const scriptId = 'file-script-' + Date.now();
                const fullPath = this.options.baseUrl + filePath;
                const script = document.createElement('script');
                script.id = scriptId;
                script.src = fullPath;
                script.onload = () => {
                    const content = window.__fileContent || '';
                    delete window.__fileContent;
                    document.getElementById(scriptId)?.remove();
                    resolve(content);
                };
                script.onerror = () => {
                    document.getElementById(scriptId)?.remove();
                    reject(new Error(`Failed to load ${filePath}`));
                };
                document.head.appendChild(script);
            });
        }
        
        getAllFiles(node, files = []) {
            if (node.type === 'file') {
                files.push(node);
            } else if (node.children) {
                node.children.forEach(child => this.getAllFiles(child, files));
            }
            return files;
        }
        
        getUrlFile() {
            const params = new URLSearchParams(window.location.search);
            const fileParam = params.get('file');
            if (!fileParam) return null;
            
            const decodedPath = decodeURIComponent(fileParam);
            const name = decodedPath.split('/').pop();
            return { path: decodedPath, name: name };
        }
        
        updateUrl(filePath) {
            const url = new URL(window.location);
            url.searchParams.set('file', filePath);
            window.history.replaceState({}, '', url);
        }
        
        buildFileLinks() {
            this.fileLinks.clear();
            
            for (const [filePath, content] of Object.entries(this.allFilesContent)) {
                const fileName = filePath.split('/').pop().replace('.md', '');
                
                for (const [otherPath, otherContent] of Object.entries(this.allFilesContent)) {
                    if (otherPath !== filePath && otherContent.includes(`[[${fileName}]]`)) {
                        if (!this.fileLinks.has(filePath)) {
                            this.fileLinks.set(filePath, []);
                        }
                        this.fileLinks.get(filePath).push(otherPath);
                    }
                }
            }
        }
        
        generateBacklinks() {
            if (!this.currentFile) {
                return;
            }
            
            const backlinks = this.fileLinks.get(this.currentFile.path) || [];
        }

        updateReadTime() {
            if (!this.currentContent) return;
            const words = this.currentContent.trim().split(/\s+/).length;
            const minutes = Math.ceil(words / 200);
            const el = document.getElementById('read-time');
            if (el) el.textContent = minutes + ' min read';
        }

        updateWordCount() {
            if (!this.currentContent) return;
            const words = this.currentContent.trim().split(/\s+/).length;
            const el = document.getElementById('word-count');
            if (el) el.textContent = words + ' words';
        }
        
        renderFileTree() {
            const fileTree = document.getElementById('file-tree');
            if (fileTree && this.fileTree) {
                fileTree.innerHTML = this.renderTreeNode(this.fileTree);
                this.attachTreeEvents();
            }
        }
        
        renderTreeNode(node, level = 0) {
            if (node.type === 'folder') {
                const childrenHtml = node.children ? 
                    node.children.map(child => this.renderTreeNode(child, level + 1)).join('') : '';
                
                return `
                    <div class="tree-item">
                        <div class="tree-folder" data-name="${node.name}">
                            <i class="icon fa-solid fa-chevron-right"></i>
                            <i class="fa-solid fa-folder folder-icon"></i>
                            <span class="tree-item-name">${this.sanitize(node.name)}</span>
                        </div>
                        <div class="tree-folder-children">
                            ${childrenHtml}
                        </div>
                    </div>
                `;
            } else {
                const ext = node.name.split('.').pop().toLowerCase();
                const iconClass = ext === 'md' ? 'fa-regular fa-file-lines' : 
                              ext === 'js' ? 'fa-brands fa-js' :
                              ext === 'css' ? 'fa-brands fa-css3' :
                              ext === 'html' ? 'fa-brands fa-html5' :
                              ext === 'json' ? 'fa-solid fa-code' :
                              ext === 'excalidraw' ? 'fa-solid fa-pen-nib' :
                              'fa-regular fa-file';
                return `
                    <div class="tree-item">
                        <div class="tree-file" data-path="${node.path}" data-name="${node.name}" onclick="window.voltMD.loadFile('${node.path.replace(/'/g, "\\'")}', '${node.name.replace(/'/g, "\\'")}')">
                            <i class="icon ${iconClass}"></i>
                            <span class="tree-item-name">${this.sanitize(node.name)}</span>
                        </div>
                    </div>
                `;
            }
        }
        
        attachTreeEvents() {
            document.querySelectorAll('.tree-folder').forEach(folder => {
                folder.addEventListener('click', (e) => {
                    e.stopPropagation();
                    folder.classList.toggle('expanded');
                    const children = folder.nextElementSibling;
                    if (children) {
                        children.classList.toggle('expanded');
                    }
                    this.saveState();
                });
            });
            
            document.querySelectorAll('.tree-file').forEach(file => {
                file.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const path = file.dataset.path;
                    const name = file.dataset.name;
                    this.loadFile(path, name);
                });
            });
        }
        
        async loadFile(filePath, fileName) {
            try {
                let content;
                
                if (filePath.endsWith('.html')) {
                    const response = await fetch(filePath);
                    content = await response.text();
                    this.currentContent = content;
                    this.currentFile = { path: filePath, name: fileName };
                    this.renderHtmlContent(content);
                    this.updateWordCount();
                    
                    document.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
                    document.querySelector(`[data-path="${filePath}"]`)?.classList.add('active');
                    
                    const display = document.getElementById('file-name-display');
                    if (display) {
                        display.textContent = this.sanitize(fileName.replace('.html', ''));
                    }
                    
                    this.saveState();
                    this.updateUrl(filePath);
                    return;
                }
                
                if (fileName.endsWith('.excalidraw')) {
                    if (this.allFilesContent[filePath]) {
                        content = this.allFilesContent[filePath];
                    } else {
                        content = await this.loadFromScript(filePath);
                        this.allFilesContent[filePath] = content;
                    }
                    
                    this.currentContent = content;
                    this.currentFile = { path: filePath, name: fileName };
                    this.renderExcalidrawContent(content);
                    
                    document.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
                    document.querySelector(`[data-path="${filePath}"]`)?.classList.add('active');
                    
                    const display = document.getElementById('file-name-display');
                    if (display) {
                        display.textContent = this.sanitize(fileName.replace('.excalidraw', ''));
                    }
                    
                    this.saveState();
                    this.updateUrl(filePath);
                    return;
                }
                
                if (this.allFilesContent[filePath]) {
                    content = this.allFilesContent[filePath];
                } else {
                    content = await this.loadFromScript(filePath);
                    this.allFilesContent[filePath] = content;
                }
                
                this.currentContent = content;
                this.currentFile = { path: filePath, name: fileName };
                this.renderContent();
                this.generateTOC();
                this.redrawGraph();
                this.updateReadTime();
                this.updateWordCount();
                
                document.querySelectorAll('.tree-file').forEach(f => f.classList.remove('active'));
                document.querySelector(`[data-path="${filePath}"]`)?.classList.add('active');
                
                setTimeout(() => this.revealCurrentFile(), 100);
                
                const display = document.getElementById('file-name-display');
                if (display) {
                    display.textContent = this.sanitize(fileName.replace('.md', ''));
                }
                
                this.saveState();
                this.updateUrl(filePath);

                setTimeout(() => {
                    const contentWrapper = document.querySelector('.content-wrapper');
                    if (contentWrapper) {
                        const savedScroll = this.getScrollPosition(filePath);
                        if (savedScroll > 0) {
                            contentWrapper.scrollTop = savedScroll;
                        }
                    }
                }, 50);
            } catch (error) {
                console.error('Error loading file:', error);
                const contentEl = document.getElementById('content');
                if (contentEl) {
                    contentEl.innerHTML = `<div class="empty-state">
                        <p>Error loading file: ${filePath}</p>
                        <p style="font-size:12px;color:var(--text-muted)">${error.message}</p>
                    </div>`;
                }
            }
        }
        
        renderContent() {
            if (!this.currentContent) {
                console.error('No current content to render');
                return;
            }
            
            let content = this.currentContent;
            
            content = content.replace(/==([^=]+)==/g, '<mark>$1</mark>');
            
            content = this.processObsidianImages(content);
            
            let html;
            try {
                if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                    html = marked.parse(content);
                } else {
                    console.error('marked is not loaded');
                    html = '<pre>' + this.sanitize(content) + '</pre>';
                }
            } catch (e) {
                console.error('Error parsing markdown:', e);
                html = '<pre>' + this.sanitize(content) + '</pre>';
            }
            
            if (this.settings.syntaxHighlight) {
                html = this.highlightCodeBlocks(html);
            }
            
            if (this.settings.copyCode) {
                html = this.addCopyButtons(html);
            }
            
            html = this.processWikiLinks(html);
            
            html = this.processHashtags(html);
            
            html = this.processLatex(html);
            
            html = this.addCollapsibleLists(html);
            
            html = this.styleYamlFrontMatter(html);
            
            html = this.detectAndApplyRtl(html);
            
            html = this.addHeadingFolds(html);
            
            const contentEl = document.getElementById('content');
            if (!contentEl) {
                console.error('Content element not found!');
                return;
            }
            
            contentEl.innerHTML = html;
            
            this.attachContentEvents();
            this.attachImagePreviewEvents();
            this.currentHtml = html;
            
            setTimeout(() => this.renderMermaidBlocks(), 100);
        }
        
        renderHtmlContent(html) {
            const contentEl = document.getElementById('content');
            if (!contentEl) {
                console.error('Content element not found!');
                return;
            }
            
            contentEl.innerHTML = html;
            this.attachContentEvents();
            this.attachImagePreviewEvents();
            setTimeout(() => this.renderMermaidBlocks(), 100);
        }

        renderExcalidrawContent(content) {
            const contentEl = document.getElementById('content');
            if (!contentEl) {
                console.error('Content element not found!');
                return;
            }
            
            const encodedContent = encodeURIComponent(content);
            const excalidrawUrl = `https://excalidraw.com/?json=${encodedContent}&title=Excalidraw`;
            
            contentEl.innerHTML = `
                <div class="excalidraw-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h2 style="margin-bottom: 8px;">Excalidraw Drawing</h2>
                        <p style="color: var(--text-muted); font-size: 14px;">This file contains an Excalidraw diagram</p>
                    </div>
                    <a href="${excalidrawUrl}" target="_blank" class="excalidraw-btn" style="
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 24px;
                        background: var(--accent-color);
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 15px;
                        font-weight: 500;
                        cursor: pointer;
                        text-decoration: none;
                        transition: all 0.2s;
                    ">
                        <i class="fa-solid fa-pen-nib"></i>
                        Open in Excalidraw
                    </a>
                </div>
            `;
            
            document.querySelector('.content-wrapper')?.classList.add('full-width');
        }

        processObsidianImages(content) {
            content = content.replace(/!\[(https?:\/\/[^\]]+)\]\(([^)]+)\)/g, (match, url, alias) => {
                const cleanUrl = url.trim();
                const cleanAlias = alias.trim();
                return `![${cleanAlias}](${cleanUrl})`;
            });
            return content;
        }

        addHeadingFolds(html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            const headings = temp.querySelectorAll('h1, h2, h3, h4, h5, h6');
            const headingElements = Array.from(headings);
            
            headingElements.forEach((heading, index) => {
                if (heading.querySelector('.heading-fold')) return;
                
                const foldBtn = document.createElement('span');
                foldBtn.className = 'heading-fold';
                foldBtn.dataset.collapsed = 'false';
                foldBtn.dataset.index = index;
                foldBtn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                heading.insertBefore(foldBtn, heading.firstChild);
                
                const level = parseInt(heading.tagName[1]);
                let endIndex = headingElements.length;
                for (let i = index + 1; i < headingElements.length; i++) {
                    const nextLevel = parseInt(headingElements[i].tagName[1]);
                    if (nextLevel <= level) {
                        endIndex = i;
                        break;
                    }
                }
                
                const contentContainer = document.createElement('div');
                contentContainer.className = 'heading-section';
                contentContainer.dataset.startIndex = index;
                contentContainer.dataset.endIndex = endIndex;
                
                let next = heading.nextElementSibling;
                while (next && !next.matches('h1, h2, h3, h4, h5, h6')) {
                    const toMove = next;
                    next = next.nextElementSibling;
                    contentContainer.appendChild(toMove);
                }
                
                if (contentContainer.children.length > 0) {
                    heading.parentNode.insertBefore(contentContainer, heading.nextSibling);
                }
            });
            
            return temp.innerHTML;
        }

        attachImagePreviewEvents() {
            const content = document.getElementById('content');
            if (!content) return;
            
            const images = content.querySelectorAll('img');
            if (images.length === 0) return;
            
            images.forEach((img) => {
                img.classList.add('obsidian-img');
                img.style.cursor = 'zoom-in';
                img.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openImageViewer(img);
                });
            });
            
            this.initImageViewer();
        }

        initImageViewer() {
            if (this.imageViewerInitialized) return;
            this.imageViewerInitialized = true;
            
            const viewer = document.createElement('div');
            viewer.className = 'image-viewer';
            viewer.id = 'image-viewer';
            viewer.innerHTML = `
                <button class="image-viewer-close" title="Close (Esc)">&times;</button>
                <div class="image-viewer-content">
                    <button class="image-viewer-nav prev" title="Previous (←)">&#8249;</button>
                    <img class="image-viewer-img" src="" alt="Preview">
                    <button class="image-viewer-nav next" title="Next (→)">&#8250;</button>
                </div>
                <div class="image-viewer-counter"></div>
                <div class="image-viewer-zoom-controls">
                    <button class="image-viewer-zoom zoom-out" title="Zoom Out">−</button>
                    <button class="image-viewer-zoom zoom-reset" title="Reset">1:1</button>
                    <button class="image-viewer-zoom zoom-in" title="Zoom In">+</button>
                </div>
            `;
            document.body.appendChild(viewer);
            
            this.viewerElements = {
                viewer: viewer,
                img: viewer.querySelector('.image-viewer-img'),
                close: viewer.querySelector('.image-viewer-close'),
                prev: viewer.querySelector('.prev'),
                next: viewer.querySelector('.next'),
                counter: viewer.querySelector('.counter'),
                zoomIn: viewer.querySelector('.zoom-in'),
                zoomOut: viewer.querySelector('.zoom-out'),
                zoomReset: viewer.querySelector('.zoom-reset')
            };
            
            this.viewerState = {
                currentIndex: 0,
                images: [],
                scale: 1,
                panX: 0,
                panY: 0,
                isDragging: false,
                startX: 0,
                startY: 0
            };
            
            this.viewerElements.close.addEventListener('click', () => this.closeImageViewer());
            this.viewerElements.prev.addEventListener('click', () => this.navigateImage(-1));
            this.viewerElements.next.addEventListener('click', () => this.navigateImage(1));
            this.viewerElements.zoomIn.addEventListener('click', () => this.zoomImage(1.25));
            this.viewerElements.zoomOut.addEventListener('click', () => this.zoomImage(0.8));
            this.viewerElements.zoomReset.addEventListener('click', () => this.resetZoom());
            
            this.viewerElements.viewer.addEventListener('click', (e) => {
                if (e.target === this.viewerElements.viewer || e.target === this.viewerElements.viewer.querySelector('.image-viewer-content')) {
                    this.closeImageViewer();
                }
            });
            
            this.viewerElements.img.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                this.zoomImage(delta);
            });
            
            this.viewerElements.img.addEventListener('mousedown', (e) => this.startPan(e));
            document.addEventListener('mousemove', (e) => this.doPan(e));
            document.addEventListener('mouseup', () => this.endPan());
            
            this.viewerElements.img.addEventListener('touchstart', (e) => this.handleTouchStart(e));
            this.viewerElements.img.addEventListener('touchmove', (e) => this.handleTouchMove(e));
            this.viewerElements.img.addEventListener('touchend', () => this.handleTouchEnd());
            
            document.addEventListener('keydown', (e) => {
                if (!this.viewerElements.viewer.classList.contains('active')) return;
                if (e.key === 'Escape') this.closeImageViewer();
                if (e.key === 'ArrowLeft') this.navigateImage(-1);
                if (e.key === 'ArrowRight') this.navigateImage(1);
                if (e.key === '+' || e.key === '=') this.zoomImage(1.25);
                if (e.key === '-') this.zoomImage(0.8);
                if (e.key === '0') this.resetZoom();
            });
        }

        openImageViewer(clickedImg) {
            const content = document.getElementById('content');
            const allImages = Array.from(content.querySelectorAll('img'));
            this.viewerState.images = allImages;
            this.viewerState.currentIndex = allImages.indexOf(clickedImg);
            
            this.updateViewerImage();
            this.viewerElements.viewer.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        closeImageViewer() {
            this.viewerElements.viewer.classList.remove('active');
            document.body.style.overflow = '';
            this.resetZoom();
        }

        updateViewerImage() {
            const img = this.viewerState.images[this.viewerState.currentIndex];
            if (!img) return;
            
            this.viewerElements.img.src = img.src;
            this.viewerElements.img.alt = img.alt || `Image ${this.viewerState.currentIndex + 1}`;
            
            const counter = this.viewerElements.viewer.querySelector('.image-viewer-counter');
            counter.textContent = `${this.viewerState.currentIndex + 1} / ${this.viewerState.images.length}`;
            
            this.viewerElements.prev.style.display = this.viewerState.images.length > 1 ? 'flex' : 'none';
            this.viewerElements.next.style.display = this.viewerState.images.length > 1 ? 'flex' : 'none';
            
            this.resetZoom();
        }

        navigateImage(direction) {
            const total = this.viewerState.images.length;
            this.viewerState.currentIndex = (this.viewerState.currentIndex + direction + total) % total;
            this.updateViewerImage();
        }

        zoomImage(factor) {
            this.viewerState.scale = Math.max(0.25, Math.min(5, this.viewerState.scale * factor));
            this.viewerElements.img.style.transform = `translate(${this.viewerState.panX}px, ${this.viewerState.panY}px) scale(${this.viewerState.scale})`;
        }

        resetZoom() {
            this.viewerState.scale = 1;
            this.viewerState.panX = 0;
            this.viewerState.panY = 0;
            this.viewerElements.img.style.transform = 'translate(0, 0) scale(1)';
        }

        startPan(e) {
            this.viewerState.isDragging = true;
            this.viewerState.startX = e.clientX - this.viewerState.panX;
            this.viewerState.startY = e.clientY - this.viewerState.panY;
            this.viewerElements.img.style.cursor = 'grabbing';
        }

        doPan(e) {
            if (!this.viewerState.isDragging) return;
            this.viewerState.panX = e.clientX - this.viewerState.startX;
            this.viewerState.panY = e.clientY - this.viewerState.startY;
            this.viewerElements.img.style.transform = `translate(${this.viewerState.panX}px, ${this.viewerState.panY}px) scale(${this.viewerState.scale})`;
        }

        endPan() {
            this.viewerState.isDragging = false;
            this.viewerElements.img.style.cursor = 'grab';
        }

        handleTouchStart(e) {
            if (e.touches.length === 1) {
                this.viewerState.isDragging = true;
                this.viewerState.startX = e.touches[0].clientX - this.viewerState.panX;
                this.viewerState.startY = e.touches[0].clientY - this.viewerState.panY;
            } else if (e.touches.length === 2) {
                this.viewerState.initialPinchDistance = this.getPinchDistance(e);
            }
        }

        handleTouchMove(e) {
            e.preventDefault();
            if (e.touches.length === 1 && this.viewerState.isDragging) {
                this.viewerState.panX = e.touches[0].clientX - this.viewerState.startX;
                this.viewerState.panY = e.touches[0].clientY - this.viewerState.startY;
                this.viewerElements.img.style.transform = `translate(${this.viewerState.panX}px, ${this.viewerState.panY}px) scale(${this.viewerState.scale})`;
            } else if (e.touches.length === 2) {
                const currentDistance = this.getPinchDistance(e);
                const factor = currentDistance / this.viewerState.initialPinchDistance;
                this.viewerState.initialPinchDistance = currentDistance;
                this.zoomImage(factor);
            }
        }

        handleTouchEnd() {
            this.viewerState.isDragging = false;
        }

        getPinchDistance(e) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        openIframePreview(url, title) {
            const existing = document.getElementById('iframe-preview-overlay');
            if (existing) existing.remove();
            
            const overlay = document.createElement('div');
            overlay.id = 'iframe-preview-overlay';
            overlay.innerHTML = `
                <div class="iframe-preview-box">
                    <div class="iframe-preview-header">
                        <span class="iframe-preview-title">${title}</span>
                        <button class="iframe-preview-close">&times;</button>
                    </div>
                    <iframe class="iframe-preview-content" src="${url}" frameborder="0"></iframe>
                </div>
            `;
            document.body.appendChild(overlay);
            
            overlay.querySelector('.iframe-preview-close').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });
            
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') overlay.remove();
            });
        }
        
        styleYamlFrontMatter(html) {
            const yamlRegex = /^---\n([\s\S]*?)\n---/;
            const match = html.match(yamlRegex);
            
            if (match) {
                const yamlContent = match[1];
                const tableHtml = this.yamlToTable(yamlContent);
                html = html.replace(yamlRegex, tableHtml);
            }
            
            return html;
        }
        
        yamlToTable(yaml) {
            const lines = yaml.split('\n').filter(line => line.trim());
            let rows = '';
            
            lines.forEach(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex > 0) {
                    const key = line.substring(0, colonIndex).trim();
                    let value = line.substring(colonIndex + 1).trim();
                    
                    if (value.startsWith('[') && value.endsWith(']')) {
                        const tags = value.slice(1, -1).split(',').map(t => t.trim());
                        value = tags.map(tag => `<span class="yaml-tag">${tag}</span>`).join(' ');
                    } else if (value === 'true' || value === 'false') {
                        value = `<span class="yaml-boolean">${value}</span>`;
                    } else if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                        value = `<span class="yaml-datetime">${value}</span>`;
                    }
                    
                    rows += `<tr><td>${key}</td><td>${value}</td></tr>`;
                }
            });
            
            if (rows) {
                return `<table class="yaml-properties-table">${rows}</table>`;
            }
            return '';
        }
        
        styleYaml(yaml) {
            const lines = yaml.split('\n');
            return lines.map(line => {
                let styled = line
                    .replace(/^(\s*)([a-zA-Z-]+)(:)/gm, '$1<span class="token key">$2</span><span class="token punctuation">$3</span>')
                    .replace(/:\s*(true|false)(\s|$)/gm, ': <span class="token boolean">$1</span>$2')
                    .replace(/:\s*(\d{4}-\d{2}-\d{2}[T\d:+-]+)(\s|$)/gm, ': <span class="token datetime">$1</span>$2')
                    .replace(/:\s*(\d+)(\s|$)/gm, ': <span class="token number">$1</span>$2')
                    .replace(/(["'])(.*?)\1/g, '<span class="token string">$1$2$1</span>')
                    .replace(/(\s)(#.*)$/gm, '$1<span class="token comment">$2</span>');
                return styled;
            }).join('\n');
        }
        
        addCollapsibleLists(html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            temp.querySelectorAll('ul, ol').forEach(list => {
                const children = list.querySelectorAll(':scope > li > ul, :scope > li > ol');
                
                if (children.length > 0) {
                    list.classList.add('has-list-bullet');
                    
                    children.forEach(child => {
                        const parentLi = child.closest('li');
                        if (parentLi) {
                            const indicator = document.createElement('span');
                            indicator.className = 'list-collapse-indicator';
                            indicator.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 8L12 17L21 8"/>
                            </svg>`;
                            
                            const firstChild = parentLi.firstChild;
                            if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
                                parentLi.insertBefore(indicator, firstChild);
                            } else {
                                parentLi.insertBefore(indicator, parentLi.firstChild);
                            }
                            
                            const sublist = parentLi.querySelector(':scope > ul, :scope > ol');
                            if (sublist) {
                                sublist.style.display = 'none';
                            }
                        }
                    });
                }
            });
            
            return temp.innerHTML;
        }
        
        toggleListCollapse(indicator, forceCollapse = null) {
            const li = indicator.closest('li');
            if (!li) return;
            
            const sublist = li.querySelector(':scope > ul, :scope > ol');
            if (!sublist) return;
            
            const isCollapsed = indicator.classList.contains('collapsed');
            const shouldCollapse = forceCollapse !== null ? forceCollapse : isCollapsed;
            
            indicator.classList.toggle('collapsed', !shouldCollapse);
            sublist.style.display = shouldCollapse ? 'block' : 'none';
        }
        
        async openFloatWindow(filePath, fileName) {
            const overlay = document.getElementById('float-overlay');
            const floatWin = document.getElementById('float-window');
            const floatTitle = document.getElementById('float-title');
            const floatContent = document.getElementById('float-content');
            
            if (!overlay || !floatWin || !floatTitle || !floatContent) return;
            
            floatTitle.textContent = fileName.replace('.md', '');
            floatContent.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
            
            overlay.classList.add('active');
            floatWin.classList.add('active');
            
            try {
                let content;
                if (this.allFilesContent[filePath]) {
                    content = this.allFilesContent[filePath];
                } else {
                    const response = await fetch(filePath);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    content = await response.text();
                    this.allFilesContent[filePath] = content;
                }
                
                content = content.replace(/==([^=]+)==/g, '<mark>$1</mark>');
                
                let html;
                if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
                    html = marked.parse(content);
                } else {
                    html = '<pre>' + this.sanitize(content) + '</pre>';
                }
                
                html = this.processWikiLinks(html);
                html = this.styleYamlFrontMatter(html);
                html = this.detectAndApplyRtl(html);
                
                floatContent.innerHTML = html;
                this.attachFloatWindowEvents();
            } catch (error) {
                floatContent.innerHTML = `<div class="empty-state"><p>Error loading file</p><p style="font-size:12px;color:var(--text-muted)">${error.message}</p></div>`;
            }
        }
        
        closeFloatWindow() {
            document.getElementById('float-overlay')?.classList.remove('active');
            document.getElementById('float-window')?.classList.remove('active');
        }
        
        attachFloatWindowEvents() {
            document.querySelectorAll('#float-content .wiki-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        this.openFloatWindow(link.dataset.path, link.dataset.name);
                    } else {
                        this.closeFloatWindow();
                        this.loadFile(link.dataset.path, link.dataset.name);
                    }
                });
            });
        }
        
        processHashtags(html) {
            return html.replace(/#(\w+)/g, (match, tag) => {
                const colors = {
                    'coding': '#e8f5e9',
                    'important': '#ffebee',
                    'todo': '#fff3e0',
                    'note': '#e3f2fd',
                    'bug': '#fce4ec',
                    'question': '#f3e5f5',
                    'idea': '#e0f2f1',
                    'tip': '#f1f8e9'
                };
                const color = colors[tag.toLowerCase()] || 'var(--bg-tertiary)';
                return `<span class="hashtag" style="background:${color};padding:2px 6px;border-radius:4px;font-size:0.9em;">#${tag}</span>`;
            });
        }
        
        processLatex(html) {
            if (typeof katex === 'undefined') return html;
            
            html = html.replace(/\$\$([\s\S]*?)\$\$/g, (match, tex) => {
                try {
                    return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
                } catch (e) {
                    return `<div class="latex-error">${match}</div>`;
                }
            });
            
            html = html.replace(/\$([^\$\n]+?)\$/g, (match, tex) => {
                if (tex.includes('$$')) return match;
                try {
                    return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
                } catch (e) {
                    return `<span class="latex-error">${match}</span>`;
                }
            });
            
            return html;
        }
        
        processWikiLinks(html) {
            return html.replace(/\[\[([^\]]+)\]\]/g, (match, link) => {
                const fileName = link.trim();
                const file = this.allFiles.find(f => f.name === `${fileName}.md`);
                if (file) {
                    return `<a class="wiki-link" href="#" data-path="${file.path}" data-name="${file.name}">${this.sanitize(fileName)}</a>`;
                }
                return `<span class="wiki-link-broken">${this.sanitize(link)}</span>`;
            });
        }
        
        attachContentEvents() {
            document.querySelectorAll('.wiki-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) {
                        const path = link.dataset.path;
                        const name = link.dataset.name;
                        this.openFloatWindow(path, name);
                    } else {
                        const path = link.dataset.path;
                        const name = link.dataset.name;
                        this.loadFile(path, name);
                    }
                });
            });
            
            document.querySelectorAll('.copy-btn').forEach(btn => {
                btn.addEventListener('click', () => this.copyCodeBlock(btn));
            });
            
            document.querySelectorAll('.list-collapse-indicator').forEach(indicator => {
                indicator.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleListCollapse(indicator);
                });
            });
            
            document.querySelectorAll('.heading-fold').forEach(btn => {
                btn.addEventListener('click', () => this.toggleHeading(btn));
            });
        }
        
        toggleHeading(btn) {
            const isCollapsed = btn.dataset.collapsed === 'true';
            btn.dataset.collapsed = isCollapsed ? 'false' : 'true';
            btn.innerHTML = isCollapsed ? '<i class="fa-solid fa-plus"></i>' : '<i class="fa-solid fa-minus"></i>';
            
            const heading = btn.closest('h1, h2, h3, h4, h5, h6');
            if (heading) {
                const content = heading.nextElementSibling;
                if (content && content.classList.contains('heading-section')) {
                    content.classList.toggle('collapsed', !isCollapsed);
                }
            }
        }
        
        highlightCodeBlocks(html) {
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            temp.querySelectorAll('pre code').forEach(block => {
                if (hljs && !block.classList.contains('mermaid') && !block.classList.contains('language-mermaid')) {
                    try {
                        hljs.highlightElement(block);
                    } catch (e) {
                        console.warn('Highlight error:', e);
                    }
                }
            });
            
            return temp.innerHTML;
        }
        
        addCopyButtons(html) {
            return html.replace(/<pre><code[^>]*class="([^"]*)"[^>]*>(.+?)<\/code><\/pre>/gs, (match, lang, code) => {
                const language = lang.split(' ')[0] || 'text';
                if (language === 'mermaid') {
                    return `<pre><code class="${lang}">${code}</code></pre>`;
                }
                return `<div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-lang">${this.sanitize(language)}</span>
                        <button class="copy-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                            </svg>
                            Copy
                        </button>
                    </div>
                    <pre><code class="${lang}">${code}</code></pre>
                </div>`;
            });
        }
        
        copyCodeBlock(btn) {
            const code = btn.closest('.code-block-wrapper').querySelector('code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                const original = btn.innerHTML;
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg> Copied!';
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.innerHTML = original;
                    btn.classList.remove('copied');
                }, 2000);
            });
        }
        
        generateTOC() {
            const contentEl = document.getElementById('content');
            if (!contentEl) return;
            
            const headings = contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
            
            headings.forEach((heading, index) => {
                const level = parseInt(heading.tagName[1]);
                if (!heading.id) {
                    heading.id = `heading-${index}`;
                }
            });
            
            const tocHtml = Array.from(headings).map((heading, index) => {
                const level = parseInt(heading.tagName[1]);
                const text = heading.textContent;
                const id = heading.id || `heading-${index}`;
                return `<div class="toc-item level-${level - 1}" data-id="${id}">
                    ${this.sanitize(text)}
                </div>`;
            }).join('');
            
            const tocEl = document.getElementById('toc-content');
            if (tocEl) {
                tocEl.innerHTML = tocHtml || '<div style="color: var(--text-muted); font-size: 12px; padding: 8px;">No headings</div>';
                
                tocEl.querySelectorAll('.toc-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const el = document.getElementById(item.dataset.id);
                        if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    });
                });
            }
        }
        
        detectAndApplyRtl(html) {
            const rtlPattern = /[\u0600-\u06FF\u0590-\u05FF\u0700-\u074F]/;
            const temp = document.createElement('div');
            temp.innerHTML = html;
            
            let hasRtl = false;
            temp.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6').forEach(el => {
                if (rtlPattern.test(el.textContent)) {
                    el.setAttribute('dir', 'rtl');
                    el.style.textAlign = 'right';
                    hasRtl = true;
                }
            });
            
            if (hasRtl) {
                temp.querySelectorAll('ul, ol').forEach(el => {
                    el.style.paddingRight = '26px';
                    el.style.paddingLeft = '0';
                });
            }
            
            return temp.innerHTML;
        }
        
        searchFiles(query) {
            const resultsEl = document.getElementById('search-results');
            const fileTreeEl = document.getElementById('file-tree');
            
            if (!query.trim()) {
                resultsEl.classList.remove('active');
                fileTreeEl.style.display = 'block';
                return;
            }
            
            const lowerQuery = query.toLowerCase();
            const results = this.allFiles.filter(file => 
                file.name.toLowerCase().includes(lowerQuery) ||
                file.path.toLowerCase().includes(lowerQuery)
            );
            
            fileTreeEl.style.display = results.length ? 'none' : 'block';
            resultsEl.classList.toggle('active', results.length > 0);
            
            if (results.length) {
                resultsEl.innerHTML = results.map(file => `
                    <div class="search-result-item" data-path="${file.path}" data-name="${file.name}">
                        <div class="file-name">${this.sanitize(file.name)}</div>
                        <div class="file-path">${this.sanitize(file.path)}</div>
                    </div>
                `).join('');
                
                resultsEl.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        this.loadFile(item.dataset.path, item.dataset.name);
                        document.getElementById('search-input').value = '';
                        this.searchFiles('');
                    });
                });
            }
        }
        
        clearFileSearch() {
            document.getElementById('search-results').classList.remove('active');
            document.getElementById('file-tree').style.display = 'block';
            document.getElementById('search-input').value = '';
        }
        
        searchContent(query) {
            if (!this.currentHtml) return;
            
            const contentEl = document.getElementById('content');
            if (!query.trim()) {
                contentEl.innerHTML = this.currentHtml;
                this.attachContentEvents();
                this.contentSearchMatches = [];
                return;
            }
            
            const lowerQuery = query.toLowerCase();
            this.contentSearchMatches = [];
            let tempHtml = this.currentHtml;
            
            const regex = new RegExp(`(${query})`, 'gi');
            let matchCount = 0;
            
            tempHtml = tempHtml.replace(regex, (match) => {
                const id = `match-${matchCount}`;
                this.contentSearchMatches.push(id);
                matchCount++;
                return `<span class="search-highlight" id="${id}">${this.sanitize(match)}</span>`;
            });
            
            contentEl.innerHTML = tempHtml;
            this.attachContentEvents();
            
            if (this.contentSearchMatches.length > 0) {
                this.contentSearchIndex = 0;
                this.highlightCurrentMatch();
            }
        }
        
        nextContentMatch() {
            if (this.contentSearchMatches.length === 0) return;
            this.contentSearchIndex = (this.contentSearchIndex + 1) % this.contentSearchMatches.length;
            this.highlightCurrentMatch();
        }
        
        highlightCurrentMatch() {
            document.querySelectorAll('.search-highlight').forEach((el, i) => {
                el.classList.toggle('current', i === this.contentSearchIndex);
            });
            
            const current = document.getElementById(this.contentSearchMatches[this.contentSearchIndex]);
            if (current) {
                current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
        
        clearContentSearch() {
            document.getElementById('content-search-input').value = '';
            if (this.currentFile) {
                this.renderContent();
            }
            this.contentSearchMatches = [];
        }
        
        initSyntaxHighlighting() {
            if (typeof hljs !== 'undefined') {
                document.querySelectorAll('pre code').forEach(block => {
                    try {
                        hljs.highlightElement(block);
                    } catch (e) {
                        console.warn('Syntax highlighting error:', e);
                    }
                });
            }
        }
        
        initMermaid() {
            if (typeof mermaid !== 'undefined') {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: this.options.theme === 'dark' ? 'dark' : 'default',
                    securityLevel: 'loose',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                });
            }
        }
        
        async renderMermaidBlocks() {
            if (typeof mermaid === 'undefined') return;
            
            const contentEl = document.getElementById('content');
            if (!contentEl) return;
            
            const codeBlocks = contentEl.querySelectorAll('pre code.language-mermaid, pre code.mermaid');
            
            for (let i = 0; i < codeBlocks.length; i++) {
                const block = codeBlocks[i];
                const code = block.textContent.trim();
                const pre = block.parentElement;
                
                try {
                    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                    const { svg } = await mermaid.render(id, code);
                    
                    const container = document.createElement('div');
                    container.className = 'mermaid-container';
                    container.style.cssText = 'text-align: center; padding: 20px 0; overflow-x: auto;';
                    container.innerHTML = svg;
                    
                    pre.replaceWith(container);
                } catch (e) {
                    console.warn('Mermaid rendering error:', e);
                }
            }
        }
        
        initGraph() {
            const container = document.getElementById('network');
            if (!container) return;

            if (this.network) {
                this.network.destroy();
                this.network = null;
            }

            const savedPositions = localStorage.getItem('volt-md-graph-positions');
            if (savedPositions) {
                this.graphNodePositions = JSON.parse(savedPositions);
            }

            this.networkDragging = false;
            this.redrawGraph();
        }
        
        redrawGraph() {
            const container = document.getElementById('network');
            if (!container) return;

            const nodes = [];
            const edges = [];
            
            const linkedPaths = new Set();
            
            if (this.currentFile) {
                const currentContent = this.allFilesContent[this.currentFile.path] || '';
                const currentLinks = currentContent.match(/\[\[([^\]]+)\]\]/g) || [];
                currentLinks.forEach(match => {
                    const linkName = match.replace(/\[\[|\]\]/g, '');
                    const linkedFile = this.allFiles.find(f => f.name === `${linkName}.md`);
                    if (linkedFile) linkedPaths.add(linkedFile.path);
                });
                
                this.allFiles.forEach(file => {
                    if (file.path === this.currentFile.path) return;
                    const content = this.allFilesContent[file.path] || '';
                    const fileLinks = content.match(/\[\[([^\]]+)\]\]/g) || [];
                    fileLinks.forEach(match => {
                        const linkName = match.replace(/\[\[|\]\]/g, '');
                        if (linkName + '.md' === this.currentFile.name) {
                            linkedPaths.add(file.path);
                        }
                    });
                });
            }
            
            const visiblePaths = new Set([this.currentFile?.path, ...linkedPaths].filter(Boolean));
            const visibleFiles = this.allFiles.filter(f => visiblePaths.has(f.path));
            
            if (visibleFiles.length === 0) {
                container.innerHTML = '';
                this.network = null;
                this.updateBacklinks();
                this.updateOutgoingLinks();
                this.updateBreadcrumbs();
                return;
            }
            
            const containerRect = container.getBoundingClientRect();
            const centerX = containerRect.width / 2;
            const centerY = containerRect.height / 2;
            const radius = Math.min(containerRect.width, containerRect.height) * 0.35;
            
            visibleFiles.forEach((file, index) => {
                const existingPos = this.graphNodePositions?.[file.path];
                const angle = (index / visibleFiles.length) * 2 * Math.PI - Math.PI / 2;
                const x = existingPos ? existingPos.x : centerX + radius * Math.cos(angle);
                const y = existingPos ? existingPos.y : centerY + radius * Math.sin(angle);
                
                let color = '#888';
                if (file.path === this.currentFile?.path) {
                    const style = getComputedStyle(document.documentElement);
                    color = style.getPropertyValue('--accent-color').trim() || '#0df';
                } else if (linkedPaths.has(file.path)) {
                    color = '#40c057';
                }
                
                nodes.push({
                    id: file.path,
                    label: file.name.replace('.md', ''),
                    x: x,
                    y: y,
                    color: { background: color, border: color },
                    shape: 'dot',
                    size: file.path === this.currentFile?.path ? 20 : 15,
                    font: { 
                        color: '#999', 
                        size: 12,
                        face: '-apple-system, BlinkMacSystemFont, sans-serif',
                        background: 'rgba(0,0,0,0)',
                        strokeWidth: 0,
                        align: 'center',
                        offset: { y: -25 }
                    },
                    chosen: false
                });
            });
            
            const edgeSet = new Set();
            visibleFiles.forEach((file, i) => {
                const content = this.allFilesContent[file.path] || '';
                const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
                matches.forEach(match => {
                    const linkName = match.replace(/\[\[|\]\]/g, '');
                    const targetFile = this.allFiles.find(f => f.name === `${linkName}.md`);
                    if (targetFile && visiblePaths.has(targetFile.path)) {
                        const edgeKey = [file.path, targetFile.path].sort().join('-');
                        if (!edgeSet.has(edgeKey)) {
                            edgeSet.add(edgeKey);
                            edges.push({ from: file.path, to: targetFile.path, color: '#444' });
                        }
                    }
                });
            });
            
            const data = { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(edges) };
            
            const options = {
                nodes: {
                    borderWidth: 0,
                    shadow: false
                },
                edges: {
                    width: 1,
                    smooth: { type: 'continuous' }
                },
                physics: {
                    enabled: false
                },
                interaction: {
                    dragNodes: true,
                    dragView: true,
                    zoomView: true,
                    hover: true,
                    selectable: true
                }
            };
            
            this.network = new vis.Network(container, data, options);
            
            this.network.on('dragEnd', (params) => {
                if (params.nodes.length > 0) {
                    const nodeId = params.nodes[0];
                    const pos = this.network.getPosition(nodeId);
                    if (!this.graphNodePositions) this.graphNodePositions = {};
                    this.graphNodePositions[nodeId] = { x: pos.x, y: pos.y };
                    localStorage.setItem('volt-md-graph-positions', JSON.stringify(this.graphNodePositions));
                }
                this.networkDragging = false;
            });
            
            this.network.on('dragStart', () => {
                this.networkDragging = true;
            });
            
            this.network.on('click', (params) => {
                if (this.networkDragging) {
                    this.networkDragging = false;
                    return;
                }
                const nodeId = params.node || (params.nodes && params.nodes[0]);
                if (nodeId) {
                    const node = nodes.find(n => n.id === nodeId);
                    if (node) {
                        this.loadFile(node.id, node.label + '.md');
                    }
                }
            });
            
            this.updateBacklinks();
            this.updateOutgoingLinks();
            this.updateBreadcrumbs();
        }
        
        updateBreadcrumbs() {
            const breadcrumbsEl = document.getElementById('breadcrumbs');
            if (!breadcrumbsEl) return;
            
            if (!this.currentFile) {
                breadcrumbsEl.innerHTML = '<span class="breadcrumb-item">No file selected</span>';
                return;
            }
            
            const pathParts = this.currentFile.path.split('/').filter(p => p && p !== '.');
            
            const pathMap = new Map();
            let currentPath = '';
            pathParts.forEach((part, index) => {
                currentPath = currentPath ? currentPath + '/' + part : part;
                pathMap.set(index, { name: part, path: currentPath });
            });
            
            let html = '';
            pathMap.forEach((item, index) => {
                const isLast = index === pathMap.size - 1;
                const isFirst = index === 0;
                
                if (index > 0) {
                    html += '<span class="breadcrumb-separator">/</span>';
                }
                
                if (isLast) {
                    html += `<span class="breadcrumb-item current">${this.sanitize(item.name.replace('.md', ''))}</span>`;
                } else {
                    const targetPath = './' + item.path;
                    const file = this.allFiles.find(f => f.path === targetPath || f.path.endsWith(item.name));
                    if (file) {
                        html += `<span class="breadcrumb-item ${isFirst ? 'root' : ''}" data-path="${file.path}" data-name="${file.name}">${this.sanitize(item.name.replace('.md', ''))}</span>`;
                    } else {
                        html += `<span class="breadcrumb-item ${isFirst ? 'root' : ''}">${this.sanitize(item.name.replace('.md', ''))}</span>`;
                    }
                }
            });
            
            breadcrumbsEl.innerHTML = html;
            
            breadcrumbsEl.querySelectorAll('.breadcrumb-item[data-path]').forEach(item => {
                item.addEventListener('click', () => {
                    this.loadFile(item.dataset.path, item.dataset.name);
                });
            });
        }
        
        updateBacklinks() {
            const listEl = document.getElementById('backlinks-list');
            if (!listEl || !this.currentFile) {
                if (listEl) listEl.innerHTML = '<div class="backlinks-empty">No file open</div>';
                return;
            }
            
            const backlinks = [];
            const currentName = this.currentFile.name.replace('.md', '');
            
            this.allFiles.forEach(file => {
                if (file.path === this.currentFile.path) return;
                const content = this.allFilesContent[file.path] || '';
                const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
                matches.forEach(match => {
                    const linkName = match.replace(/\[\[|\]\]/g, '');
                    if (linkName === currentName) {
                        backlinks.push({ path: file.path, name: file.name.replace('.md', '') });
                    }
                });
            });
            
            if (backlinks.length === 0) {
                listEl.innerHTML = '<div class="backlinks-empty">No backlinks found</div>';
                return;
            }
            
            listEl.innerHTML = backlinks.map(backlink => 
                `<div class="backlink-item" data-path="${backlink.path}" data-name="${backlink.name}">${backlink.name}</div>`
            ).join('');
            
            listEl.querySelectorAll('.backlink-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.loadFile(item.dataset.path, item.dataset.name + '.md');
                });
            });
        }
        
        updateOutgoingLinks() {
            const listEl = document.getElementById('outgoing-list');
            if (!listEl || !this.currentFile) {
                if (listEl) listEl.innerHTML = '<div class="links-empty">No file open</div>';
                return;
            }
            
            const content = this.allFilesContent[this.currentFile.path] || '';
            const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
            const linkedFiles = [];
            
            matches.forEach(match => {
                const linkName = match.replace(/\[\[|\]\]/g, '');
                const linkedFile = this.allFiles.find(f => f.name.replace('.md', '') === linkName);
                if (linkedFile && linkedFile.path !== this.currentFile.path) {
                    if (!linkedFiles.find(f => f.path === linkedFile.path)) {
                        linkedFiles.push({ path: linkedFile.path, name: linkedFile.name.replace('.md', '') });
                    }
                }
            });
            
            if (linkedFiles.length === 0) {
                listEl.innerHTML = '<div class="links-empty">No outgoing links</div>';
                return;
            }
            
            listEl.innerHTML = linkedFiles.map(link => 
                `<div class="link-item" data-path="${link.path}" data-name="${link.name}">${link.name}</div>`
            ).join('');
            
            listEl.querySelectorAll('.link-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.loadFile(item.dataset.path, item.dataset.name + '.md');
                });
            });
        }

        executeCustomJs(jsCode) {
            if (!jsCode || typeof jsCode !== 'string') return;
            try {
                const fn = new Function('voltMD', 'document', jsCode);
                fn(this, document);
            } catch (e) {
                console.error('Custom JS error:', e);
                alert('Error in custom JS: ' + e.message);
            }
        }
        
        sanitize(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

