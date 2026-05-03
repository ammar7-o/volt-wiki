#!/bin/bash

cd "$(dirname "$0")/.." || exit

python3 << 'EOF'
import os
import json

STATIC_DIR = "static"
PROJECT_ROOT = os.getcwd()
expected_files = set()

def scan_directory(base_path, static_base):
    global expected_files
    items = []
    for item in sorted(os.listdir(base_path)):
        if item.startswith('.') or item == 'node_modules' or item == STATIC_DIR:
            continue
        full_path = os.path.join(base_path, item)
        
        if os.path.isdir(full_path):
            children = scan_directory(full_path, static_base)
            if children:
                items.append({
                    "type": "folder",
                    "name": item,
                    "children": children
                })
        elif os.path.isfile(full_path):
            rel_path = os.path.relpath(full_path, PROJECT_ROOT)
            if item.endswith('.md'):
                js_path = os.path.join(STATIC_DIR, rel_path.replace('.md', '.js'))
                expected_files.add(js_path.replace('\\', '/'))
                items.append({
                    "type": "file",
                    "name": item,
                    "path": "./" + js_path.replace('\\', '/')
                })
            elif item.endswith('.html'):
                if item == 'index.html' and rel_path == 'index.html':
                    continue
                js_path = os.path.join(STATIC_DIR, rel_path.replace('.html', '.js'))
                expected_files.add(js_path.replace('\\', '/'))
                items.append({
                    "type": "file",
                    "name": item,
                    "path": "./" + js_path.replace('\\', '/'),
                    "isHtml": True
                })
            elif item.endswith('.excalidraw'):
                js_path = os.path.join(STATIC_DIR, rel_path.replace('.excalidraw', '.js'))
                expected_files.add(js_path.replace('\\', '/'))
                items.append({
                    "type": "file",
                    "name": item,
                    "path": "./" + js_path.replace('\\', '/'),
                    "isExcalidraw": True
                })
    return items

def remove_stale_files():
    if not os.path.exists(STATIC_DIR):
        return
    
    expected_html = set()
    expected_js_no_prefix = set()
    for root, dirs, files in os.walk(PROJECT_ROOT):
        for file in files:
            if file.startswith('.'): continue
            if file == 'node_modules' or file == STATIC_DIR: continue
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, PROJECT_ROOT).replace('\\', '/')
            if file.endswith('.md'):
                expected_html.add(rel_path.replace('.md', '.html'))
                expected_js_no_prefix.add(rel_path.replace('.md', '.js'))
            elif file.endswith('.html') and not (file == 'index.html' and os.path.dirname(rel_path) == ''):
                expected_html.add(rel_path)
                expected_js_no_prefix.add(rel_path.replace('.html', '.js'))
            elif file.endswith('.excalidraw'):
                expected_js_no_prefix.add(rel_path.replace('.excalidraw', '.js'))
    
    static_full = os.path.join(PROJECT_ROOT, STATIC_DIR)
    for root, dirs, files in os.walk(static_full):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, static_full).replace('\\', '/')
            if file.endswith('.js') and rel_path not in expected_js_no_prefix:
                os.remove(full_path)
                print(f"Removed: {full_path}")
            elif file.endswith('.html') and rel_path not in expected_html:
                os.remove(full_path)
                print(f"Removed: {full_path}")

def convert_files_to_json(base_path):
    global expected_files
    if not os.path.exists(STATIC_DIR):
        os.makedirs(STATIC_DIR)
    
    for item in sorted(os.listdir(base_path)):
        if item.startswith('.') or item == 'node_modules' or item == STATIC_DIR:
            continue
        full_path = os.path.join(base_path, item)
        
        if os.path.isdir(full_path):
            convert_files_to_json(full_path)
        elif os.path.isfile(full_path):
            rel_path = os.path.relpath(full_path, PROJECT_ROOT)
            if item.endswith('.md'):
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                js_file = os.path.join(STATIC_DIR, rel_path.replace('.md', '.js'))
                expected_files.add(js_file.replace('\\', '/'))
                dir_path = os.path.dirname(js_file)
                if dir_path and not os.path.exists(dir_path):
                    os.makedirs(dir_path)
                
                with open(js_file, 'w', encoding='utf-8') as f:
                    f.write(f'window.__fileContent = {json.dumps(content, ensure_ascii=False)};')
                
                print(f"Created: {js_file}")
            elif item.endswith('.html'):
                if item == 'index.html' and rel_path == 'index.html':
                    continue
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                js_file = os.path.join(STATIC_DIR, rel_path.replace('.html', '.js'))
                expected_files.add(js_file.replace('\\', '/'))
                dir_path = os.path.dirname(js_file)
                if dir_path and not os.path.exists(dir_path):
                    os.makedirs(dir_path)
                
                with open(js_file, 'w', encoding='utf-8') as f:
                    f.write(f'window.__fileContent = {json.dumps(content, ensure_ascii=False)};')
                
                print(f"Created: {js_file}")
            elif item.endswith('.excalidraw'):
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                js_file = os.path.join(STATIC_DIR, rel_path.replace('.excalidraw', '.js'))
                expected_files.add(js_file.replace('\\', '/'))
                dir_path = os.path.dirname(js_file)
                if dir_path and not os.path.exists(dir_path):
                    os.makedirs(dir_path)
                
                with open(js_file, 'w', encoding='utf-8') as f:
                    f.write(f'window.__fileContent = {json.dumps(content, ensure_ascii=False)};')
                
                print(f"Created: {js_file}")

convert_files_to_json(PROJECT_ROOT)

remove_stale_files()

tree = scan_directory(PROJECT_ROOT, STATIC_DIR)
result = {"tree": [{"type": "folder", "name": "root", "children": tree}]}

js_file = "volt-core/base.js"
with open(js_file, 'w', encoding='utf-8') as f:
    f.write(f'window.__fileTree = {json.dumps(result, ensure_ascii=False)};')

print(f"Generated {js_file}")
EOF