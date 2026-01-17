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
    }
});

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const processBtn = document.getElementById('processBtn');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');

// Initialize date field with today's date
document.getElementById('date').valueAsDate = new Date();

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
        processBtn.disabled = false;
    };
    reader.readAsDataURL(file);
}

// Clear preview
function clearPreview() {
    selectedFile = null;
    previewImage.src = '';
    previewSection.style.display = 'none';
    fileInput.value = '';
    processBtn.disabled = true;
    resultsSection.style.display = 'none';
}

// Process image
async function processImage() {
    if (!selectedFile) {
        alert('请先选择图片！');
        return;
    }

    // Get selected recognition method
    const method = document.querySelector('input[name="method"]:checked').value;

    // Show loading
    loadingSection.style.display = 'block';
    resultsSection.style.display = 'none';
    processBtn.disabled = true;

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
        const response = await fetch(getApiUrl(API_ENDPOINTS.UPLOAD), {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        // Hide loading
        loadingSection.style.display = 'none';
        processBtn.disabled = false;

        if (result.success) {
            displayResults(result);
        } else {
            alert('识别失败: ' + result.error);
        }
    } catch (error) {
        loadingSection.style.display = 'none';
        processBtn.disabled = false;
        alert('处理图片时出错: ' + error.message);
    }
}

// Display results
function displayResults(result) {
    // Raw text
    document.getElementById('rawText').value = result.rawText;

    // Move count
    document.getElementById('moveCount').textContent = result.moveCount;

    // Moves list
    const movesList = document.getElementById('movesList');
    movesList.innerHTML = '';
    result.moves.forEach((move, index) => {
        const moveTag = document.createElement('span');
        moveTag.className = 'move-tag';
        moveTag.textContent = move;
        movesList.appendChild(moveTag);
    });

    // Fill editable moves textarea
    document.getElementById('movesEdit').value = result.moves.join(' ');

    // PGN output
    document.getElementById('pgnOutput').value = result.pgn;
    recognizedPGN = result.pgn;

    // Show results section
    resultsSection.style.display = 'block';

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    fetch(getApiUrl(API_ENDPOINTS.DOWNLOAD_PGN), {
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
        lastMove = null;
        boardWasModified = true;
        console.log('Undo performed, remaining moves:', recordedMoves);
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

    // Record the move in SAN format
    recordedMoves.push(move.san);
    lastMove = { from: source, to: target }; // Store move details for undo detection
    boardWasModified = true;
    console.log('Recorded move:', move.san, 'All recorded moves:', recordedMoves);

    return true;
}

// Handle snap end (update game state)
function handleSnapEnd() {
    if (isBoardEditing) {
        // Update board position to match game state
        board.position(game.fen());
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
    fetch(getApiUrl(API_ENDPOINTS.VALIDATE_MOVES), {
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
    currentMoveIndex = validPositions.length - 1; // Start at last valid position
    console.log('Valid positions saved:', validPositions);

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
            movesHTML += `<span class="validated-move valid">${prefix}${item.move}</span>`;
        } else {
            movesHTML += `<span class="validated-move invalid">${prefix}${item.move}<span class="error-hint">${item.error || '非法招法'}</span></span>`;
        }
    });

    movesListDiv.innerHTML = movesHTML;

    // Show board with last valid position
    if (summary.lastValidFen) {
        showBoard(summary.lastValidFen);
    }

    // Show position navigator if we have valid positions
    if (validPositions.length > 1) {
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

    const boardBlock = document.getElementById('boardBlock');
    const boardContainer = document.getElementById('chessboard').parentElement;

    // Create navigator UI
    const navHTML = `
        <div id="positionNavigator" class="position-navigator" style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <span style="font-weight: bold;">跳转到局面:</span>
                <button class="btn btn-small btn-secondary" onclick="navigatePosition(-1)">⏮ 开始</button>
                <button class="btn btn-small btn-secondary" onclick="navigatePosition(-1, true)">◀ 上一步</button>
                <select id="positionSelect" onchange="jumpToPosition(this.value)" style="padding: 5px; border-radius: 4px; border: 1px solid #ddd; min-width: 200px;">
                    ${validPositions.map((pos, idx) => `
                        <option value="${idx}">${pos.moveIndex === -1 ? '初始局面' : `第${pos.moveIndex + 1}步: ${pos.move}`}</option>
                    `).join('')}
                </select>
                <button class="btn btn-small btn-secondary" onclick="navigatePosition(1, true)">下一步 ▶</button>
                <button class="btn btn-small btn-secondary" onclick="navigatePosition(999999)">最后 ⏭</button>
            </div>
        </div>
    `;

    // Insert after board container
    boardContainer.insertAdjacentHTML('afterend', navHTML);

    // Set current position in dropdown
    document.getElementById('positionSelect').value = currentMoveIndex;
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

    // Update dropdown
    document.getElementById('positionSelect').value = currentMoveIndex;
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
}

// Show chess board with given FEN
function showBoard(fen) {
    console.log('showBoard called with FEN:', fen);
    console.log('Chess library available:', typeof Chess !== 'undefined');

    const boardBlock = document.getElementById('boardBlock');
    boardBlock.style.display = 'block';

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
        setTimeout(() => {
            console.log('Updating board position to:', fen);
            board.resize();
            board.position(fen);
            game = new Chess(fen);
            console.log('Game state:', game.fen());
        }, 100);
    }
}

// Start editing board
function startEditingBoard() {
    isBoardEditing = true;

    // Reset recorded moves for new editing session
    recordedMoves = [];
    lastMove = null;

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

    const boardContainer = document.getElementById('chessboard').parentElement;
    boardContainer.classList.add('board-editing-mode');

    document.getElementById('generateFromBoardBtn').style.display = 'inline-block';

    // Hide position navigator while editing
    const navigator = document.getElementById('positionNavigator');
    if (navigator) {
        navigator.style.display = 'none';
    }

    alert('编辑模式已开启！\n\n请从当前局面继续走棋修正招法：\n1. 系统会记录每一步\n2. 把棋子拖回原位可以撤销\n3. 完成后点击"从棋盘生成 PGN"');
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
    fetch(getApiUrl(API_ENDPOINTS.FEN_TO_PGN), {
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

    // Exit editing mode
    isBoardEditing = false;
    boardWasModified = false;
    movesBeforeEditing = []; // Reset for next editing session
    lastMove = null; // Reset last move tracking
    const boardContainer = document.getElementById('chessboard').parentElement;
    boardContainer.classList.remove('board-editing-mode');
    document.getElementById('generateFromBoardBtn').style.display = 'none';

    // Show position navigator again
    const navigator = document.getElementById('positionNavigator');
    if (navigator) {
        navigator.style.display = 'block';
    }
}
