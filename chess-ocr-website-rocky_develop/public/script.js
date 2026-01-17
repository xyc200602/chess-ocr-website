// Global variables
let selectedFile = null;
let recognizedPGN = '';

// Check if chess libraries are loaded
window.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded');
    console.log('jQuery available:', typeof $ !== 'undefined');
    console.log('Chessboard available:', typeof Chessboard !== 'undefined');
    console.log('Chess available:', typeof Chess !== 'undefined');

    if (typeof Chess === 'undefined') {
        console.error('❌ Chess.js library not loaded!');
        alert('Chess.js 库加载失败，请刷新页面重试。');
        return;
    }

    // Test Chess library
    try {
        const testGame = new Chess();
        console.log('✓ Chess.js test successful, FEN:', testGame.fen());
    } catch (e) {
        console.error('❌ Chess.js test failed:', e);
        alert('Chess.js 库初始化失败: ' + e.message);
        return;
    }

    // Initialize chessboard with starting position
    setTimeout(() => {
        initBoard();
        if (board) {
            board.position('start');
            game = new Chess();
            console.log('✓ Chessboard initialized with starting position');
        }
    }, 100);

    // Add real-time sync for movesEdit textarea
    const movesEditTextarea = document.getElementById('movesEdit');
    if (movesEditTextarea) {
        let updateTimeout;
        movesEditTextarea.addEventListener('input', function() {
            // Clear previous timeout
            clearTimeout(updateTimeout);

            // Debounce: wait 500ms after user stops typing
            updateTimeout = setTimeout(() => {
                updateBoardFromMovesText();
            }, 500);
        });
        console.log('✓ Real-time sync enabled for movesEdit textarea');
    }
});

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
// processBtn is now in preview section, will be accessed via querySelector
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');

// Initialize date field with today's date
document.getElementById('date').valueAsDate = new Date();

// Check API configuration on page load
checkApiConfig();

async function checkApiConfig() {
    const statusSection = document.getElementById('apiStatusSection');
    const statusContent = document.getElementById('apiStatusContent');

    try {
        const response = await fetch('/api/test-config');
        const data = await response.json();
        
        if (data.configured) {
            statusContent.innerHTML = `
                <div class="api-status-success">
                    ✅ API密钥已配置（从.env文件读取）
                </div>
            `;
        } else {
            statusContent.innerHTML = `
                <div class="api-status-warning">
                    ⚠️ API密钥未配置
                    <br><br>
                    请在服务器的 .env 文件中配置 ZHIPU_API_KEY
                    <br>
                    <a href="https://open.bigmodel.cn/" target="_blank">点击获取智谱AI密钥</a>
                </div>
            `;
        }
        statusSection.style.display = 'block';
    } catch (error) {
        statusContent.innerHTML = `
            <div class="api-status-warning">
                ⚠️ 无法检查API配置: ${error.message}
            </div>
        `;
        statusSection.style.display = 'block';
    }
}

// Event listeners for drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Handle file selection
function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件！');
        return;
    }

    selectedFile = file;

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewSection.style.display = 'block';
        // Enable process button if it exists (it's now in preview section)
        const processBtnInPreview = previewSection.querySelector('.btn-primary');
        if (processBtnInPreview) {
            processBtnInPreview.disabled = false;
        }
    };
    reader.readAsDataURL(file);
}

// Clear preview
// Toggle image zoom (only within left column)
function toggleImageZoom(imageId) {
    const img = document.getElementById(imageId);
    const icon = document.getElementById(imageId + 'ZoomIcon');
    const container = img.closest('.preview-image-container');
    
    if (img.classList.contains('zoomed')) {
        // Restore
        img.classList.remove('zoomed');
        if (container) container.classList.remove('zoomed');
        if (icon) icon.textContent = '🔍 放大';
    } else {
        // Zoom (within left column only)
        img.classList.add('zoomed');
        if (container) container.classList.add('zoomed');
        if (icon) icon.textContent = '🔍 还原';
    }
}

function clearPreview() {
    selectedFile = null;
    previewImage.src = '';
    previewSection.style.display = 'none';
    fileInput.value = '';
    // Disable process button (it's now in preview section)
    const processBtnInPreview = previewSection.querySelector('.btn-primary');
    if (processBtnInPreview) {
        processBtnInPreview.disabled = true;
    }
    resultsSection.style.display = 'none';
    document.getElementById('emptyMiddleSection').style.display = 'none';
    
    // Reset image zoom if active
    if (previewImage.classList.contains('zoomed')) {
        toggleImageZoom('previewImage');
    }
    
    // Reset board to starting position
    if (board) {
        board.position('start');
        game = new Chess();
    }
    
    // Reset moves edit section
    document.getElementById('movesEdit').value = '';
    document.getElementById('processMovesBtn').style.display = 'block';
    document.getElementById('regenerateBtn').style.display = 'none';
    document.getElementById('movesEditTitle').textContent = '手动编辑着法';
    
    // Clear PGN output
    document.getElementById('pgnOutput').value = '';
    
    // Clear validation results
    document.getElementById('validationBlock').style.display = 'none';
    document.getElementById('positionNavigatorContainer').innerHTML = '';
}

// Process image
async function processImage() {
    if (!selectedFile) {
        alert('请先选择图片！');
        return;
    }

    // Get recognition method
    const method = document.querySelector('input[name="method"]:checked').value;

    // Show loading
    loadingSection.style.display = 'block';
    resultsSection.style.display = 'none';
    // Disable process button (it's now in preview section)
    const processBtnInPreview = previewSection.querySelector('.btn-primary');
    if (processBtnInPreview) {
        processBtnInPreview.disabled = true;
    }

    // Prepare form data
    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('method', method);
    formData.append('white', document.getElementById('white').value);
    formData.append('black', document.getElementById('black').value);
    formData.append('event', document.getElementById('event').value);
    formData.append('site', document.getElementById('site').value);
    formData.append('date', document.getElementById('date').value);
    formData.append('round', document.getElementById('round').value);
    formData.append('result', document.getElementById('result').value);

    try {
        // Send to server
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        // Hide loading
        loadingSection.style.display = 'none';
        // Enable process button (it's now in preview section)
        const processBtnInPreview = previewSection.querySelector('.btn-primary');
        if (processBtnInPreview) {
            processBtnInPreview.disabled = false;
        }

        if (result.success) {
            console.log('Recognition result:', result);
            console.log('Moves array:', result.moves);
            displayResults(result);
        } else {
            alert('识别失败: ' + result.error);
        }
    } catch (error) {
        loadingSection.style.display = 'none';
        // Enable process button (it's now in preview section)
        const processBtnInPreview = previewSection.querySelector('.btn-primary');
        if (processBtnInPreview) {
            processBtnInPreview.disabled = false;
        }
        alert('处理图片时出错: ' + error.message);
    }
}

// Display results
function displayResults(result) {
    // Ensure moves array exists
    const moves = result.moves || [];
    
    // Raw text
    document.getElementById('rawText').value = result.rawText || '';

    // Move count
    document.getElementById('moveCount').textContent = moves.length;

    // Moves list
    const movesList = document.getElementById('movesList');
    if (movesList) {
        movesList.innerHTML = '';
        if (moves.length > 0) {
            moves.forEach((move, index) => {
                const moveTag = document.createElement('span');
                moveTag.className = 'move-tag';
                moveTag.textContent = move;
                movesList.appendChild(moveTag);
            });
        } else {
            movesList.innerHTML = '<p style="color: var(--secondary-color); font-size: 0.9em;">未识别到招法</p>';
        }
    }

    // Fill editable moves textarea
    document.getElementById('movesEdit').value = moves.join(' ');

    // PGN output
    document.getElementById('pgnOutput').value = result.pgn || '';
    recognizedPGN = result.pgn || '';

    // Show results section and hide empty states
    resultsSection.style.display = 'block';
    document.getElementById('emptyMiddleSection').style.display = 'none';
    
    // Update moves edit section - show regenerate button, hide process button
    document.getElementById('processMovesBtn').style.display = 'none';
    document.getElementById('regenerateBtn').style.display = 'block';
    document.getElementById('movesEditTitle').textContent = '手动编辑着法';
    
    // Automatically validate moves after recognition
    if (moves.length > 0) {
        // Small delay to ensure UI is updated
        setTimeout(() => {
            validateMoves();
        }, 300);
    }
}

// Process direct moves input (skip image recognition) or regenerate from edited moves
function processDirectMoves() {
    const movesText = document.getElementById('movesEdit').value.trim();
    
    if (!movesText) {
        alert('请输入招法！');
        document.getElementById('movesEdit').focus();
        return;
    }
    
    // Parse moves from text
    const moves = movesText.split(/\s+/).filter(m => m.length > 0);
    
    if (moves.length === 0) {
        alert('未找到有效招法！');
        return;
    }
    
    // Check if we already have results (from image recognition)
    const hasResults = resultsSection.style.display === 'block';
    
    if (!hasResults) {
        // First time input - treat as direct input mode
        // Get metadata
        const metadata = {
            event: document.getElementById('event').value || '?',
            site: document.getElementById('site').value || '?',
            date: document.getElementById('date').value || new Date().toISOString().split('T')[0],
            round: document.getElementById('round').value || '?',
            white: document.getElementById('white').value || 'White',
            black: document.getElementById('black').value || 'Black',
            result: document.getElementById('result').value || '*'
        };
        
        // Generate PGN
        const pgn = generatePGNFromMoves(moves, metadata);
        
        // Display results (similar to displayResults but without raw text)
        const result = {
            rawText: '直接输入模式（跳过图像识别）',
            moves: moves,
            pgn: pgn,
            moveCount: moves.length
        };
        
        displayResults(result);
        
        // Update UI - show regenerate button, hide process button
        document.getElementById('processMovesBtn').style.display = 'none';
        document.getElementById('regenerateBtn').style.display = 'block';
        document.getElementById('movesEditTitle').textContent = '手动编辑着法';
    } else {
        // Already have results - just regenerate PGN
        regeneratePGN();
    }
}

// Regenerate PGN from edited moves
function regeneratePGN() {
    const movesText = document.getElementById('movesEdit').value.trim();

    if (!movesText) {
        alert('请输入着法！');
        return;
    }

    // Split moves by whitespace
    const moves = movesText.split(/\s+/).filter(m => m.length > 0);

    // Get metadata
    const metadata = {
        event: document.getElementById('event').value || '?',
        site: document.getElementById('site').value || '?',
        date: document.getElementById('date').value || new Date().toISOString().split('T')[0],
        round: document.getElementById('round').value || '?',
        white: document.getElementById('white').value || 'White',
        black: document.getElementById('black').value || 'Black',
        result: document.getElementById('result').value || '*'
    };

    // Generate PGN
    const pgn = generatePGNFromMoves(moves, metadata);

    // Update PGN output
    document.getElementById('pgnOutput').value = pgn;
    recognizedPGN = pgn;

    // Update move count
    document.getElementById('moveCount').textContent = moves.length;
    
    // Update moves list display
    const movesList = document.getElementById('movesList');
    if (movesList) {
        movesList.innerHTML = '';
        moves.forEach((move, index) => {
            const moveTag = document.createElement('span');
            moveTag.className = 'move-tag';
            moveTag.textContent = move;
            movesList.appendChild(moveTag);
        });
    }

    alert('PGN 已重新生成！');
}

// Generate PGN from moves array (client-side version)
function generatePGNFromMoves(moves, metadata) {
    const {
        event = '?',
        site = '?',
        date = new Date().toISOString().split('T')[0],
        round = '?',
        white = 'White',
        black = 'Black',
        result = '*'
    } = metadata;

    // PGN header
    let pgn = `[Event "${event}"]\n`;
    pgn += `[Site "${site}"]\n`;
    pgn += `[Date "${date}"]\n`;
    pgn += `[Round "${round}"]\n`;
    pgn += `[White "${white}"]\n`;
    pgn += `[Black "${black}"]\n`;
    pgn += `[Result "${result}"]\n\n`;

    // Format moves into move pairs
    let moveNumber = 1;
    let formattedMoves = [];

    for (let i = 0; i < moves.length; i += 2) {
        const whiteMove = moves[i] || '';
        const blackMove = moves[i + 1] || '';

        if (whiteMove) {
            if (blackMove) {
                formattedMoves.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
            } else {
                formattedMoves.push(`${moveNumber}. ${whiteMove}`);
            }
            moveNumber++;
        }
    }

    pgn += formattedMoves.join(' ');
    if (result !== '*') {
        pgn += ' ' + result;
    }

    return pgn;
}

// Copy PGN to clipboard
function copyPGN() {
    const pgnText = document.getElementById('pgnOutput').value;
    navigator.clipboard.writeText(pgnText).then(() => {
        alert('PGN 已复制到剪贴板！');
    }).catch(err => {
        console.error('复制失败:', err);
        // Fallback: select text for manual copy
        const textarea = document.getElementById('pgnOutput');
        textarea.select();
        document.execCommand('copy');
        alert('PGN 已复制到剪贴板！');
    });
}

// Download PGN file
function downloadPGN() {
    const pgnText = document.getElementById('pgnOutput').value;
    const white = document.getElementById('white').value || 'White';
    const black = document.getElementById('black').value || 'Black';
    const filename = `【国象聯盟】 ${white} vs ${black}.pgn`;

    fetch('/download-pgn', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            pgn: pgnText,
            filename: filename
        })
    })
    .then(response => response.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    })
    .catch(error => {
        console.error('下载失败:', error);
        alert('下载失败，请手动复制 PGN 内容保存为文件。');
    });
}

// ==================== Chess Board & Validation Functions ====================

let board = null;
let game = new Chess();
let isBoardEditing = false;
let isReplacingMove = false; // Flag to indicate a replace operation is in progress
let extractedMovesArray = [];
let boardWasModified = false; // Track if user actually moved pieces
let initialBoardFen = ''; // Store initial board FEN when showing it
let recordedMoves = []; // Record user's moves when editing board
let movesBeforeEditing = []; // Store valid moves before editing starts
let lastMove = null; // Track last move for undo detection
let validPositions = []; // Store all valid positions during validation
let currentMoveIndex = -1; // Track which position we're viewing

// Initialize chessboard
function initBoard() {
    if ($('#chessboard').length === 0) {
        console.error('Chessboard element not found');
        return;
    }

    console.log('Initializing chessboard...');

    board = Chessboard('chessboard', {
        draggable: true,
        position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDrop: handlePieceDrop,
        onSnapEnd: handleSnapEnd
    });

    console.log('Chessboard initialized with Wikipedia pieces');
}

// Handle piece drop (for editing mode)
function handlePieceDrop(source, target) {
    if (!isBoardEditing) {
        // In normal mode, return piece to original position
        return 'snapback';
    }

    // Check if this is an undo operation (dragging back to previous position)
    if (lastMove && source === lastMove.to && target === lastMove.from) {
        // Undo the last move
        game.undo();
        recordedMoves.pop();
        // Update lastMove to previous move if exists
        if (recordedMoves.length > 0 && game.history().length > 0) {
            const history = game.history({ verbose: true });
            if (history.length > 0) {
                const lastHistoryMove = history[history.length - 1];
                lastMove = { from: lastHistoryMove.from, to: lastHistoryMove.to };
            } else {
                lastMove = null;
            }
        } else {
            lastMove = null;
        }
        boardWasModified = true;
        console.log('Undo performed, remaining moves:', recordedMoves);
        
        // Update moves edit textarea
        const allMoves = movesBeforeEditing.concat(recordedMoves);
        document.getElementById('movesEdit').value = allMoves.join(' ');
        
        // Re-validate after undo
        setTimeout(() => {
            checkAndRevalidateAfterEdit();
        }, 300);
        
        return true;
    }

    // In editing mode, allow piece movement and record it
    const move = game.move({
        from: source,
        to: target,
        promotion: 'q' // Always promote to queen for simplicity
    });

    if (move === null) {
        return 'snapback';
    }

    // Check if the move matches the next expected move
    let nextMoveIndex = -1;
    if (validPositions.length > 0 && currentMoveIndex >= 0) {
        const currentPos = validPositions[currentMoveIndex];
        if (currentPos && currentPos.moveIndex !== undefined) {
            nextMoveIndex = currentPos.moveIndex + 1;
        }
    }
    
    // If the move matches the next expected move, directly replace without dialog
    if (nextMoveIndex >= 0 && nextMoveIndex < originalMovesArrayBeforeEdit.length) {
        const nextExpectedMove = originalMovesArrayBeforeEdit[nextMoveIndex];
        if (move.san === nextExpectedMove || move.san.toLowerCase() === nextExpectedMove.toLowerCase()) {
            // Directly replace without showing dialog
            performReplaceMove(move.san);
            lastMove = { from: source, to: target };
            boardWasModified = true;
            return true;
        }
    }
    
    // Store move details for dialog
    pendingMove = { san: move.san, from: source, to: target };
    
    // Show dialog to choose insert or replace
    // Keep the move on the board while showing dialog
    showInsertReplaceDialog(move.san);
    
    return true; // Keep the move on board
}

// Store pending move for insert/replace dialog
let pendingMove = null;

// Show insert/replace dialog
function showInsertReplaceDialog(moveSan) {
    const modal = document.getElementById('insertReplaceModal');
    const modalMoveText = document.getElementById('modalMoveText');
    
    modalMoveText.textContent = `您刚刚走了: ${moveSan}`;
    
    // Show modal
    modal.style.display = 'flex';
    modal.classList.add('show');
    
    // Set up button handlers
    const insertBtn = document.getElementById('insertBtn');
    const replaceBtn = document.getElementById('replaceBtn');
    
    // Remove previous event listeners by cloning
    const newInsertBtn = insertBtn.cloneNode(true);
    const newReplaceBtn = replaceBtn.cloneNode(true);
    insertBtn.parentNode.replaceChild(newInsertBtn, insertBtn);
    replaceBtn.parentNode.replaceChild(newReplaceBtn, replaceBtn);
    
    newInsertBtn.onclick = function() {
        closeInsertReplaceDialog();
        if (pendingMove) {
            // The move is already on the board, just perform insert operation
            performInsertMove(pendingMove.san);
            lastMove = { from: pendingMove.from, to: pendingMove.to };
            boardWasModified = true;
            pendingMove = null;
        }
    };
    
    newReplaceBtn.onclick = function() {
        closeInsertReplaceDialog();
        if (pendingMove) {
            // The move is already on the board, just perform replace operation
            performReplaceMove(pendingMove.san);
            lastMove = { from: pendingMove.from, to: pendingMove.to };
            boardWasModified = true;
            pendingMove = null;
        }
    };
}

// Close insert/replace dialog
function closeInsertReplaceDialog() {
    const modal = document.getElementById('insertReplaceModal');
    modal.style.display = 'none';
    modal.classList.remove('show');
}

// Perform insert move operation
function performInsertMove(newMove) {
    // Insert position is always the next move after the currently highlighted move
    // Get the move index of the currently highlighted move
    let insertIndex = 0;
    
    if (validPositions.length > 0 && currentMoveIndex >= 0) {
        const currentPos = validPositions[currentMoveIndex];
        if (currentPos && currentPos.moveIndex !== undefined) {
            // Insert at the next position after the current highlighted move
            insertIndex = currentPos.moveIndex + 1;
        }
    } else {
        // Fallback: use movesBeforeEditing.length if no valid position
        insertIndex = movesBeforeEditing.length;
    }
    
    // Ensure insertIndex is within bounds
    insertIndex = Math.max(0, Math.min(insertIndex, originalMovesArrayBeforeEdit.length));
    
    // Insert into the original moves array
    if (insertIndex < originalMovesArrayBeforeEdit.length) {
        originalMovesArrayBeforeEdit.splice(insertIndex, 0, newMove);
    } else {
        // If we're at the end, just append
        originalMovesArrayBeforeEdit.push(newMove);
    }
    
    // Update movesBeforeEditing to include the new move (if we're at or before current position)
    // But we need to recalculate movesBeforeEditing based on the new array
    const movesEditValue = document.getElementById('movesEdit').value.trim();
    if (movesEditValue) {
        const allMoves = movesEditValue.split(/\s+/).filter(m => m.length > 0);
        // Recalculate movesBeforeEditing based on current position
        if (validPositions.length > 0 && currentMoveIndex >= 0) {
            movesBeforeEditing = [];
            for (let i = 1; i <= currentMoveIndex; i++) {
                const pos = validPositions[i];
                if (pos.move && pos.move !== '初始局面') {
                    movesBeforeEditing.push(pos.move);
                }
            }
        }
    }
    
    // Update moves edit textarea with the modified original array
    document.getElementById('movesEdit').value = originalMovesArrayBeforeEdit.join(' ');

    // Update extractedMovesArray for validation
    extractedMovesArray = [...originalMovesArrayBeforeEdit];

    console.log('Insert move:', newMove, 'at index:', insertIndex, '(next after highlighted move)');
    console.log('Original moves array after insert:', originalMovesArrayBeforeEdit);

    // Store the inserted move index for highlighting after validation
    const insertedMoveIndex = insertIndex;

    // Re-validate after insert
    setTimeout(() => {
        validateMoves();
        
        // After validation, find the position corresponding to the inserted move and highlight it
        setTimeout(() => {
            // Find the position index that corresponds to the inserted move
            let targetPositionIndex = -1;
            for (let i = 0; i < validPositions.length; i++) {
                if (validPositions[i].moveIndex === insertedMoveIndex) {
                    targetPositionIndex = i;
                    break;
                }
            }
            
            // If found, navigate to that position
            if (targetPositionIndex >= 0 && targetPositionIndex < validPositions.length) {
                currentMoveIndex = targetPositionIndex;
                const pos = validPositions[currentMoveIndex];
                
                // Update board
                board.position(pos.fen);
                game = new Chess(pos.fen);
                
                // Update movesBeforeEditing in editing mode
                if (isBoardEditing) {
                    movesBeforeEditing = [];
                    if (validPositions.length > 0 && currentMoveIndex >= 0) {
                        for (let i = 1; i <= currentMoveIndex; i++) {
                            const pos = validPositions[i];
                            if (pos.move && pos.move !== '初始局面') {
                                movesBeforeEditing.push(pos.move);
                            }
                        }
                    }
                }
                
                // Highlight the new position
                highlightCurrentMove();
            }
        }, 100);
    }, 300);
}

// Perform replace move operation
function performReplaceMove(newMove) {
    // Replace position is always the next move after the currently highlighted move
    // Get the move index of the currently highlighted move
    let replaceIndex = 0;
    
    if (validPositions.length > 0 && currentMoveIndex >= 0) {
        const currentPos = validPositions[currentMoveIndex];
        if (currentPos && currentPos.moveIndex !== undefined) {
            // Replace at the next position after the current highlighted move
            replaceIndex = currentPos.moveIndex + 1;
        }
    } else {
        // Fallback: use movesBeforeEditing.length if no valid position
        replaceIndex = movesBeforeEditing.length;
    }
    
    // Ensure replaceIndex is within bounds
    replaceIndex = Math.max(0, Math.min(replaceIndex, originalMovesArrayBeforeEdit.length));
    
    // Replace the move in the original array, but keep all subsequent moves
    if (replaceIndex < originalMovesArrayBeforeEdit.length) {
        // Replace the move at this index
        originalMovesArrayBeforeEdit[replaceIndex] = newMove;
    } else {
        // If we're at the end, just append
        originalMovesArrayBeforeEdit.push(newMove);
    }
    
    // Update movesBeforeEditing (recalculate based on current position)
    const movesEditValue = document.getElementById('movesEdit').value.trim();
    if (movesEditValue) {
        const allMoves = movesEditValue.split(/\s+/).filter(m => m.length > 0);
        // Recalculate movesBeforeEditing based on current position
        if (validPositions.length > 0 && currentMoveIndex >= 0) {
            movesBeforeEditing = [];
            for (let i = 1; i <= currentMoveIndex; i++) {
                const pos = validPositions[i];
                if (pos.move && pos.move !== '初始局面') {
                    movesBeforeEditing.push(pos.move);
                }
            }
        }
    }
    
    // Update moves edit textarea with the modified original array (which includes all subsequent moves)
    document.getElementById('movesEdit').value = originalMovesArrayBeforeEdit.join(' ');

    // Update extractedMovesArray for validation
    extractedMovesArray = [...originalMovesArrayBeforeEdit];

    console.log('Replace move:', newMove, 'at index:', replaceIndex, '(next after highlighted move)');
    console.log('Original moves array after replace:', originalMovesArrayBeforeEdit);

    // Set flag to prevent displayValidationResults from overwriting the board position
    isReplacingMove = true;
    
    // Store the replaced move index and move for highlighting after validation
    const replacedMoveIndex = replaceIndex;
    const replacedMove = newMove;

    // The board should already show the replaced move (since user just dragged it)
    // We'll keep the current board position and wait for validation to complete
    // Then update to the validated position
    console.log('Replace operation: keeping current board position, will update after validation');
    console.log('Current board FEN:', game.fen());

    // Re-validate after replace
    setTimeout(() => {
        validateMoves();
        
        // After validation, find the position corresponding to the replaced move and highlight it
        setTimeout(() => {
            // Strategy 1: Find position by moveIndex matching replacedMoveIndex
            let targetPositionIndex = -1;
            for (let i = 0; i < validPositions.length; i++) {
                if (validPositions[i].moveIndex === replacedMoveIndex) {
                    targetPositionIndex = i;
                    break;
                }
            }
            
            // Strategy 2: If not found by moveIndex, find by matching the replaced move
            if (targetPositionIndex < 0) {
                for (let i = 0; i < validPositions.length; i++) {
                    const pos = validPositions[i];
                    // Check if this position's move matches the replaced move
                    if (pos.move === replacedMove || pos.move === replacedMove.toLowerCase() || 
                        pos.move === replacedMove.toUpperCase()) {
                        // Also check if this position is at or after the replaced index
                        if (pos.moveIndex >= replacedMoveIndex) {
                            targetPositionIndex = i;
                            break;
                        }
                    }
                }
            }
            
            // Strategy 3: If still not found, find the position that matches the replaced move index
            if (targetPositionIndex < 0) {
                // Find the position that has moveIndex closest to replacedMoveIndex
                let closestIndex = -1;
                let closestDistance = Infinity;
                for (let i = 0; i < validPositions.length; i++) {
                    const distance = Math.abs(validPositions[i].moveIndex - replacedMoveIndex);
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestIndex = i;
                    }
                }
                if (closestIndex >= 0) {
                    targetPositionIndex = closestIndex;
                }
                // If still not found, use the last position
                if (targetPositionIndex < 0 && validPositions.length > 0) {
                    targetPositionIndex = validPositions.length - 1;
                }
            }
            
            // Get current board FEN (the one user just dragged to - this is the correct position)
            const currentBoardFen = game.fen();
            
            // First, try to find a position in validPositions that matches the current board FEN
            let matchingPositionIndex = -1;
            for (let i = 0; i < validPositions.length; i++) {
                // Compare FEN strings (normalize by removing move counters which may differ)
                const posFen = validPositions[i].fen;
                const currentFenNormalized = currentBoardFen.split(' ').slice(0, 4).join(' ');
                const posFenNormalized = posFen.split(' ').slice(0, 4).join(' ');
                
                if (currentFenNormalized === posFenNormalized) {
                    matchingPositionIndex = i;
                    console.log('Found matching position at index', i, 'for current board FEN');
                    break;
                }
            }
            
            // If we found a matching position, use it
            if (matchingPositionIndex >= 0) {
                targetPositionIndex = matchingPositionIndex;
            }
            
            // Update to the found position
            if (targetPositionIndex >= 0 && targetPositionIndex < validPositions.length) {
                currentMoveIndex = targetPositionIndex;
                const pos = validPositions[currentMoveIndex];
                
                const validatedFen = pos.fen;
                const currentFenNormalized = currentBoardFen.split(' ').slice(0, 4).join(' ');
                const validatedFenNormalized = validatedFen.split(' ').slice(0, 4).join(' ');
                
                console.log('Current board FEN (user dragged):', currentBoardFen);
                console.log('Validated FEN at position', targetPositionIndex, ':', validatedFen);
                
                // Only update board if the validated FEN matches the current board FEN
                // This prevents overwriting the correct position with an incorrect one
                if (currentFenNormalized === validatedFenNormalized) {
                    // Update board to match validated position (they match, so safe to update)
                    board.position(pos.fen);
                    game = new Chess(pos.fen);
                    console.log('Board updated after validation to position:', targetPositionIndex, 'FEN:', pos.fen);
                } else {
                    // Keep the current board position (user's dragged position is correct)
                    console.log('Keeping current board position (user dragged) as validated FEN differs');
                    console.log('Current FEN (normalized):', currentFenNormalized);
                    console.log('Validated FEN (normalized):', validatedFenNormalized);
                    
                    // Don't change the board - keep user's dragged position
                }
                
                // Update movesBeforeEditing in editing mode
                if (isBoardEditing) {
                    movesBeforeEditing = [];
                    if (validPositions.length > 0 && currentMoveIndex >= 0) {
                        for (let i = 1; i <= currentMoveIndex; i++) {
                            const pos = validPositions[i];
                            if (pos.move && pos.move !== '初始局面') {
                                movesBeforeEditing.push(pos.move);
                            }
                        }
                    }
                }
                
                // Highlight the new position
                highlightCurrentMove();
            } else {
                console.warn('Could not find target position after replace, keeping current board position');
            }
            
            // Clear the flag after position update is complete
            isReplacingMove = false;
        }, 100);
    }, 300);
}

// Handle snap end (update game state)
function handleSnapEnd() {
    if (isBoardEditing) {
        // Update board position to match game state
        board.position(game.fen());
        
        // Check if there are remaining moves in the original list that could be valid
        // If so, automatically re-validate
        checkAndRevalidateAfterEdit();
    }
}

// Store original moves array before editing starts
let originalMovesArrayBeforeEdit = [];

// Check and revalidate moves after editing
function checkAndRevalidateAfterEdit() {
    if (!isBoardEditing) {
        return;
    }
    
    // Always use the full originalMovesArrayBeforeEdit array for validation
    // This ensures all subsequent moves are preserved
    if (originalMovesArrayBeforeEdit.length > 0) {
        extractedMovesArray = [...originalMovesArrayBeforeEdit];
        document.getElementById('movesEdit').value = originalMovesArrayBeforeEdit.join(' ');
        setTimeout(() => {
            validateMoves();
        }, 500);
    }
}

// Process raw text to extract moves
function processRawText() {
    const rawText = document.getElementById('rawText').value.trim();
    
    if (!rawText) {
        alert('请输入原始识别文本！');
        document.getElementById('rawText').focus();
        return;
    }
    
    // Extract moves from raw text (similar to backend logic)
    const moves = extractMovesFromText(rawText);
    
    if (moves.length === 0) {
        alert('未能从文本中提取到有效招法！');
        return;
    }
    
    // Update moves list
    updateMovesDisplay(moves);
    
    // Update moves edit textarea
    document.getElementById('movesEdit').value = moves.join(' ');
    
    // Get metadata
    const metadata = {
        event: document.getElementById('event').value || '?',
        site: document.getElementById('site').value || '?',
        date: document.getElementById('date').value || new Date().toISOString().split('T')[0],
        round: document.getElementById('round').value || '?',
        white: document.getElementById('white').value || 'White',
        black: document.getElementById('black').value || 'Black',
        result: document.getElementById('result').value || '*'
    };
    
    // Generate PGN
    const pgn = generatePGNFromMoves(moves, metadata);
    document.getElementById('pgnOutput').value = pgn;
    recognizedPGN = pgn;
    
    // Automatically validate moves
    validateMoves();
}

// Extract moves from text (client-side parsing)
function extractMovesFromText(text) {
    // Clean text
    text = text.toUpperCase();
    text = text.replace(/\s+/g, ' ').trim();
    
    const moves = [];
    
    // Strategy 1: Extract numbered moves (e.g., "1. e4 e5 2. Nf3 Nc6")
    const numberedPattern = /(\d+)\.\s*([^\d]+?)(?=\s+\d+\.|$)/g;
    let match;
    const numberedMoves = [];
    
    while ((match = numberedPattern.exec(text)) !== null) {
        const moveText = match[2].trim();
        const tokens = moveText.split(/\s+/);
        tokens.forEach(token => {
            const cleanMove = token.replace(/[.,，。、]+$/, '').trim();
            if (isValidChessMove(cleanMove)) {
                numberedMoves.push(cleanMove);
            }
        });
    }
    
    if (numberedMoves.length > 0) {
        return numberedMoves;
    }
    
    // Strategy 2: Extract all chess moves using pattern
    const chessMovePattern = /\b(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b/gi;
    const allMatches = text.match(chessMovePattern);
    
    if (allMatches) {
        allMatches.forEach(m => {
            const cleanMove = m.replace(/[.,，。、]+$/, '').trim();
            if (isValidChessMove(cleanMove)) {
                moves.push(cleanMove);
            }
        });
    }
    
    // Remove duplicates while preserving order
    const uniqueMoves = [];
    const seen = new Set();
    moves.forEach(move => {
        const normalized = move.toUpperCase();
        if (!seen.has(normalized)) {
            seen.add(normalized);
            uniqueMoves.push(normalized);
        }
    });
    
    return uniqueMoves;
}

// Check if a move is valid chess notation
function isValidChessMove(move) {
    if (!move || move.length === 0) return false;
    
    // Check for castling
    if (/^(O-O|O-O-O|0-0|0-0-0)$/i.test(move)) {
        return true;
    }
    
    // Clean move
    move = move.replace(/[.,，。、]+$/, '').trim();
    
    // Check regular move pattern
    const movePattern = /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?$/i;
    return movePattern.test(move);
}

// Update moves display
function updateMovesDisplay(moves) {
    document.getElementById('moveCount').textContent = moves.length;
    
    const movesList = document.getElementById('movesList');
    if (movesList) {
        movesList.innerHTML = '';
        if (moves.length > 0) {
            moves.forEach((move, index) => {
                const moveTag = document.createElement('span');
                moveTag.className = 'move-tag';
                moveTag.textContent = move;
                movesList.appendChild(moveTag);
            });
        } else {
            movesList.innerHTML = '<p style="color: var(--secondary-color); font-size: 0.9em;">未识别到招法</p>';
        }
    }
}

// Validate moves using backend API
function validateMoves() {
    const movesText = document.getElementById('movesEdit').value.trim();

    if (!movesText) {
        alert('请先识别或输入棋谱着法！');
        return;
    }

    // Parse moves from text
    const moves = movesText.split(/\s+/).filter(m => m.length > 0);
    extractedMovesArray = moves;

    // Show loading
    const validationBlock = document.getElementById('validationBlock');
    validationBlock.style.display = 'block';
    document.getElementById('validatedMovesList').innerHTML = '<p>正在验证...</p>';

    // Call validation API
    fetch('/api/validate-moves', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ moves: moves })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            displayValidationResults(data);
        } else {
            alert('验证失败: ' + data.error);
        }
    })
    .catch(error => {
        console.error('验证错误:', error);
        alert('验证过程中出现错误');
    });
}

// Display validation results
function displayValidationResults(data) {
    const summary = data.summary;
    const validation = data.validation;

    // Save all valid positions for navigation
    validPositions = data.validPositions || [];
    
    // Don't auto-jump to last position if in editing mode
    // Keep current position when editing
    if (!isBoardEditing) {
        currentMoveIndex = validPositions.length - 1; // Start at last valid position
    } else {
        // In editing mode, keep current position or set to current move if valid
        if (currentMoveIndex < 0 || currentMoveIndex >= validPositions.length) {
            // If current position is invalid, set to last valid position
            currentMoveIndex = validPositions.length - 1;
        }
        // Otherwise keep currentMoveIndex unchanged
    }
    console.log('Valid positions saved:', validPositions);
    console.log('Current move index (editing mode:', isBoardEditing, '):', currentMoveIndex);

    // Show summary
    const summaryDiv = document.getElementById('validationSummary');
    const validCount = summary.valid;
    const invalidCount = summary.invalid;
    const total = summary.total;

    let summaryHTML = `
        <p><strong>总计:</strong> ${total} 步 | <span style="color: #28a745;">✓ 合法: ${validCount}</span> | <span style="color: #dc3545;">✗ 非法: ${invalidCount}</span></p>
    `;

    if (invalidCount === 0) {
        summaryHTML += `<p style="margin-top: 10px;">✅ 所有招法都合法！${summary.isComplete ? ' 对局已结束。' : ''}</p>`;
        summaryDiv.className = 'validation-summary valid';
    } else {
        summaryHTML += `<p style="margin-top: 10px;">⚠️ 发现 ${invalidCount} 个非法招法，请修正。</p>`;
        summaryDiv.className = 'validation-summary invalid';
    }

    summaryDiv.innerHTML = summaryHTML;

    // Show individual moves with validation status
    const movesListDiv = document.getElementById('validatedMovesList');
    let movesHTML = '';

    validation.forEach((item, index) => {
        const moveNum = Math.floor(index / 2) + 1;
        const isWhite = index % 2 === 0;
        const prefix = isWhite ? `${moveNum}.` : '';

        if (item.isValid) {
            movesHTML += `<span class="validated-move valid" data-move-index="${index}" onclick="selectMove(${index})">${prefix}${item.move}<button class="delete-move-btn" onclick="deleteMove(${index}); event.stopPropagation();" title="删除此招法">×</button></span>`;
        } else {
            movesHTML += `<span class="validated-move invalid" data-move-index="${index}" onclick="selectMove(${index})">${prefix}${item.move}<span class="error-hint">${item.error || '非法招法'}</span><button class="delete-move-btn" onclick="deleteMove(${index}); event.stopPropagation();" title="删除此招法">×</button></span>`;
        }
    });

    movesListDiv.innerHTML = movesHTML;
    
    // Highlight current move
    highlightCurrentMove();

    // Show board with appropriate position
    // In editing mode, keep current board position; otherwise show last valid position
    // BUT: if we're in the middle of a replace operation, don't overwrite the board
    if (!isBoardEditing && summary.lastValidFen) {
        showBoard(summary.lastValidFen);
    } else if (isBoardEditing && !isReplacingMove) {
        // In editing mode, keep current board position (don't change it)
        // UNLESS we're in the middle of a replace operation
        console.log('In editing mode, keeping current board position');
    } else if (isBoardEditing && isReplacingMove) {
        // During replace operation, don't change the board - let performReplaceMove handle it
        console.log('During replace operation, skipping board update in displayValidationResults');
    } else if (summary.lastValidFen) {
        showBoard(summary.lastValidFen);
    }

    // Show position navigator if we have valid positions
    if (validPositions.length > 0) {
        showPositionNavigator();
    }
}

// Show position navigator UI
function showPositionNavigator() {
    // Remove existing navigator if any
    const existingNav = document.getElementById('positionNavigator');
    if (existingNav) {
        existingNav.remove();
    }

    const boardSection = document.getElementById('boardSection');
    const boardContainer = document.getElementById('chessboard').parentElement;
    const navigatorContainer = document.getElementById('positionNavigatorContainer');

    // Only show navigator if we have more than one position
    if (validPositions.length <= 1) {
        if (navigatorContainer) {
            navigatorContainer.innerHTML = '';
        }
        return;
    }

    // Create navigator UI with better layout
    const navHTML = `
        <div id="positionNavigator" class="position-navigator">
            <div class="navigator-controls">
                <div class="navigator-buttons-row">
                    <button class="btn btn-small btn-secondary" onclick="navigatePosition(-1)" title="跳转到开始">⏮ 开始</button>
                    <button class="btn btn-small btn-secondary" onclick="navigatePosition(-1, true)" title="上一步">◀ 上一步</button>
                    <button class="btn btn-small btn-secondary" onclick="navigatePosition(1, true)" title="下一步">下一步 ▶</button>
                    <button class="btn btn-small btn-secondary" onclick="navigatePosition(999999)" title="跳转到最后">最后 ⏭</button>
                </div>
                <select id="positionSelect" onchange="jumpToPosition(this.value)" class="navigator-select">
                    ${validPositions.map((pos, idx) => `
                        <option value="${idx}">${pos.moveIndex === -1 ? '初始局面' : `第${pos.moveIndex + 1}步: ${pos.move}`}</option>
                    `).join('')}
                </select>
            </div>
        </div>
    `;

    // Insert into navigator container
    if (navigatorContainer) {
        navigatorContainer.innerHTML = navHTML;
        
        // Set current position in dropdown
        setTimeout(() => {
            const positionSelect = document.getElementById('positionSelect');
            if (positionSelect) {
                positionSelect.value = currentMoveIndex;
            }
        }, 100);
    } else {
        console.error('positionNavigatorContainer not found!');
    }
}

// Navigate to a different position
function navigatePosition(direction, step = false) {
    if (validPositions.length === 0) return;

    if (step) {
        // Move by one step
        currentMoveIndex += direction;
        currentMoveIndex = Math.max(0, Math.min(currentMoveIndex, validPositions.length - 1));
    } else if (direction === -1) {
        // Go to start
        currentMoveIndex = 0;
    } else if (direction === 999999) {
        // Go to end
        currentMoveIndex = validPositions.length - 1;
    }

    const pos = validPositions[currentMoveIndex];
    console.log('Navigating to position:', currentMoveIndex, pos);

    // Update board
    board.position(pos.fen);
    game = new Chess(pos.fen);

    // Update movesBeforeEditing in editing mode to reflect current position
    if (isBoardEditing) {
        movesBeforeEditing = [];
        if (validPositions.length > 0 && currentMoveIndex >= 0) {
            // Get moves from valid positions up to current index
            for (let i = 1; i <= currentMoveIndex; i++) {
                const pos = validPositions[i];
                if (pos.move && pos.move !== '初始局面') {
                    movesBeforeEditing.push(pos.move);
                }
            }
        }
        console.log('Updated movesBeforeEditing after navigation:', movesBeforeEditing);
    }

    // Update dropdown and highlight (highlightCurrentMove will update dropdown)
    highlightCurrentMove();
}

// Jump to specific position from dropdown
function jumpToPosition(index) {
    index = parseInt(index);
    if (index < 0 || index >= validPositions.length) return;

    currentMoveIndex = index;
    const pos = validPositions[index];

    console.log('Jumping to position:', index, pos);

    // Update board
    board.position(pos.fen);
    game = new Chess(pos.fen);
    
    // Update movesBeforeEditing in editing mode to reflect current position
    if (isBoardEditing) {
        movesBeforeEditing = [];
        if (validPositions.length > 0 && currentMoveIndex >= 0) {
            // Get moves from valid positions up to current index
            for (let i = 1; i <= currentMoveIndex; i++) {
                const pos = validPositions[i];
                if (pos.move && pos.move !== '初始局面') {
                    movesBeforeEditing.push(pos.move);
                }
            }
        }
        console.log('Updated movesBeforeEditing after jump:', movesBeforeEditing);
    }
    
    // Highlight current move in validation list (will also update dropdown)
    highlightCurrentMove();
}

// Select a move (click on validation result)
function selectMove(moveIndex) {
    // Find the corresponding position index
    let targetPositionIndex = -1;
    for (let i = 0; i < validPositions.length; i++) {
        if (validPositions[i].moveIndex === moveIndex) {
            targetPositionIndex = i;
            break;
        }
    }
    
    // If not found in valid positions, try to find the closest valid position before this move
    if (targetPositionIndex < 0) {
        // Find the last valid position before this move
        for (let i = validPositions.length - 1; i >= 0; i--) {
            if (validPositions[i].moveIndex < moveIndex) {
                targetPositionIndex = i;
                break;
            }
        }
        // If still not found, use position 0 (initial position)
        if (targetPositionIndex < 0) {
            targetPositionIndex = 0;
        }
    }
    
    // Navigate to this position
    if (targetPositionIndex >= 0 && targetPositionIndex < validPositions.length) {
        currentMoveIndex = targetPositionIndex;
        const pos = validPositions[currentMoveIndex];
        
        // Update board
        board.position(pos.fen);
        game = new Chess(pos.fen);
        
        // Update movesBeforeEditing in editing mode to reflect current position
        if (isBoardEditing) {
            movesBeforeEditing = [];
            if (validPositions.length > 0 && currentMoveIndex >= 0) {
                // Get moves from valid positions up to current index
                for (let i = 1; i <= currentMoveIndex; i++) {
                    const pos = validPositions[i];
                    if (pos.move && pos.move !== '初始局面') {
                        movesBeforeEditing.push(pos.move);
                    }
                }
            }
            console.log('Updated movesBeforeEditing after select move:', movesBeforeEditing);
        }
        
        // Update dropdown and highlight
        highlightCurrentMove();
    }
}

// Delete a move from validation results
function deleteMove(moveIndex) {
    if (!confirm(`确定要删除第 ${moveIndex + 1} 个招法吗？`)) {
        return;
    }
    
    // Get current moves from movesEdit
    const movesText = document.getElementById('movesEdit').value.trim();
    if (!movesText) {
        alert('没有可删除的招法');
        return;
    }
    
    const moves = movesText.split(/\s+/).filter(m => m.length > 0);
    
    // Remove the move at the specified index
    if (moveIndex >= 0 && moveIndex < moves.length) {
        moves.splice(moveIndex, 1);
        
        // Update movesEdit
        document.getElementById('movesEdit').value = moves.join(' ');
        
        // Update originalMovesArrayBeforeEdit if in editing mode
        if (isBoardEditing) {
            originalMovesArrayBeforeEdit = [...moves];
        }
        
        // Re-validate moves
        setTimeout(() => {
            validateMoves();
        }, 300);
    }
}

// Highlight current move in validation list
function highlightCurrentMove() {
    // Remove previous highlight
    const allMoves = document.querySelectorAll('.validated-move');
    allMoves.forEach(move => {
        move.classList.remove('current-move');
    });
    
    // Find and highlight current move
    if (validPositions.length > 0 && currentMoveIndex >= 0) {
        const currentPos = validPositions[currentMoveIndex];
        if (currentPos && currentPos.moveIndex !== undefined) {
            const moveIndex = currentPos.moveIndex;
            const currentMoveElement = document.querySelector(`.validated-move[data-move-index="${moveIndex}"]`);
            if (currentMoveElement) {
                currentMoveElement.classList.add('current-move');
                // Scroll into view
                currentMoveElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }
    
    // Update position navigator dropdown to reflect current position
    const positionSelect = document.getElementById('positionSelect');
    if (positionSelect && currentMoveIndex >= 0) {
        positionSelect.value = currentMoveIndex;
    }
}

// Show chess board with given FEN
function showBoard(fen) {
    console.log('showBoard called with FEN:', fen);
    console.log('Chess library available:', typeof Chess !== 'undefined');

    // Store initial FEN and reset modification flag
    initialBoardFen = fen;
    boardWasModified = false;

    // Initialize board if not already done
    if (board === null) {
        // Wait for DOM to be ready
        setTimeout(() => {
            initBoard();
            // Set position after initialization
            setTimeout(() => {
                console.log('Setting board position to:', fen);
                board.position(fen);
                game = new Chess(fen);
                board.resize();
                console.log('Game state:', game.fen());
            }, 100);
        }, 100);
    } else {
        // Board already initialized, just update position
        console.log('Updating board position to:', fen);
        board.position(fen);
        game = new Chess(fen);
        board.resize();
        console.log('Game state:', game.fen());
    }
}

// Update board from movesEdit textarea in real-time
function updateBoardFromMovesText() {
    const movesText = document.getElementById('movesEdit').value.trim();

    if (!movesText) {
        // If empty, show starting position
        if (board && game) {
            board.position('start');
            game = new Chess();
        }
        return;
    }

    // Parse moves from text
    const moves = movesText.split(/\s+/).filter(m => m.length > 0);

    if (moves.length === 0) {
        return;
    }

    // Create new game and apply moves
    const tempGame = new Chess();

    // Try to apply each move
    for (const move of moves) {
        const result = tempGame.move(move);
        if (result === null) {
            // Invalid move encountered, stop here
            console.log('Invalid move encountered:', move, '- stopping at move', moves.indexOf(move));
            break;
        }
    }

    // Update board and game
    if (board) {
        board.position(tempGame.fen());
        game = tempGame;
        console.log('Board updated from text moves, final FEN:', tempGame.fen());
    }
}

// Start editing board
function startEditingBoard() {
    isBoardEditing = true;

    // Reset recorded moves for new editing session
    recordedMoves = [];
    lastMove = null;

    // Save original moves array before editing (for checking next moves)
    const movesEditValue = document.getElementById('movesEdit').value.trim();
    if (movesEditValue) {
        originalMovesArrayBeforeEdit = movesEditValue.split(/\s+/).filter(m => m.length > 0);
    } else {
        originalMovesArrayBeforeEdit = [...extractedMovesArray];
    }

    // Save valid moves up to the current position
    movesBeforeEditing = [];
    if (validPositions.length > 0 && currentMoveIndex >= 0) {
        // Get moves from valid positions up to current index
        for (let i = 1; i <= currentMoveIndex; i++) {
            const pos = validPositions[i];
            if (pos.move && pos.move !== '初始局面') {
                movesBeforeEditing.push(pos.move);
            }
        }
    } else {
        // Fallback: get from validated moves list
        const validatedMovesElement = document.getElementById('validatedMovesList');
        if (validatedMovesElement) {
            const validMoveElements = validatedMovesElement.querySelectorAll('.validated-move.valid');
            validMoveElements.forEach(el => {
                const moveText = el.textContent.trim();
                const cleanMove = moveText.replace(/^\d+\.\s*/, '').replace(/^\d+\.\.\.\s*/, '');
                if (cleanMove) {
                    movesBeforeEditing.push(cleanMove);
                }
            });
        }
    }

    console.log('Starting board editing from position:', currentMoveIndex);
    console.log('Moves before editing:', movesBeforeEditing);
    console.log('Original moves array before edit:', originalMovesArrayBeforeEdit);

    const boardContainer = document.getElementById('chessboard').parentElement;
    boardContainer.classList.add('board-editing-mode');

    document.getElementById('generateFromBoardBtn').style.display = 'inline-block';

    // Keep position navigator visible while editing
    // Navigator buttons remain available for navigation

    alert('编辑模式已开启！\n\n操作说明：\n1. 插入操作：从当前局面继续走棋，系统会在当前位置插入新招法\n2. 替换操作：先使用导航器跳转到要替换的位置，然后走棋替换后续招法\n3. 撤销操作：把棋子拖回原位可以撤销上一步\n4. 自动验证：如果下一步是合法招法，系统会自动重新验证\n5. 完成后点击"从棋盘生成 PGN"');
}

// Flip board
function flipBoard() {
    if (board) {
        board.flip();
    }
}

// Generate PGN from board position
function generatePGNFromBoard() {
    const currentFen = game.fen();

    console.log('Generating PGN from board FEN:', currentFen);
    console.log('Initial board FEN:', initialBoardFen);
    console.log('Board was modified:', boardWasModified);

    let finalFen = currentFen;
    let movesToUse = [];

    if (!boardWasModified) {
        // User didn't modify the board, use validated moves
        console.log('User did not modify board, using validated moves');

        const validatedMovesElement = document.getElementById('validatedMovesList');
        if (validatedMovesElement) {
            const validMoveElements = validatedMovesElement.querySelectorAll('.validated-move.valid');
            validMoveElements.forEach(el => {
                const moveText = el.textContent.trim();
                const cleanMove = moveText.replace(/^\d+\.\s*/, '').replace(/^\d+\.\.\.\s*/, '');
                if (cleanMove) {
                    movesToUse.push(cleanMove);
                }
            });
        }

        console.log('Using validated moves:', movesToUse);
    } else {
        // User modified the board, combine moves before editing + new recorded moves
        console.log('User modified board, combining moves');
        console.log('Moves before editing:', movesBeforeEditing);
        console.log('New recorded moves:', recordedMoves);
        finalFen = currentFen;
        movesToUse = movesBeforeEditing.concat(recordedMoves); // Combine old + new moves
        console.log('Combined moves:', movesToUse);
    }

    // Call backend API to generate PGN
    fetch('/api/fen-to-pgn', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fen: finalFen,
            moves: movesToUse
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Update PGN output
            document.getElementById('pgnOutput').value = data.pgn;

            // Update moves edit
            if (data.moves && data.moves.length > 0) {
                document.getElementById('movesEdit').value = data.moves.join(' ');
            } else if (boardWasModified && recordedMoves.length > 0) {
                // Use the recorded moves directly
                document.getElementById('movesEdit').value = recordedMoves.join(' ');
            }

            alert('✅ 已从棋盘生成 PGN！');
        } else {
            alert('生成 PGN 失败: ' + data.error);
        }
    })
    .catch(error => {
        console.error('生成 PGN 错误:', error);
        alert('生成 PGN 过程中出现错误');
    });

    // Don't exit editing mode automatically - let user continue editing
    // User can manually exit by clicking "编辑棋盘" button again or other actions
    // isBoardEditing = false;  // Removed: don't auto-exit
    // boardWasModified = false;  // Keep modified state
    // movesBeforeEditing = [];  // Keep moves for continued editing
    // lastMove = null;  // Keep last move for undo
    // const boardContainer = document.getElementById('chessboard').parentElement;
    // boardContainer.classList.remove('board-editing-mode');
    // document.getElementById('generateFromBoardBtn').style.display = 'none';

    // Position navigator remains visible (no need to show/hide)
}
