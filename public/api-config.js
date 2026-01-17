/**
 * API Configuration
 * 集中管理所有API端点配置
 */

const API_BASE_URL = window.location.origin;

// API端点配置
const API_ENDPOINTS = {
  UPLOAD: '/upload',
  VALIDATE_MOVES: '/api/validate-moves',
  FEN_TO_PGN: '/api/fen-to-pgn',
  DOWNLOAD_PGN: '/download-pgn',
  TEST_CONFIG: '/api/test-config'
};

// 获取完整API URL
function getApiUrl(endpoint) {
  return API_BASE_URL + endpoint;
}

// 导出配置（如果使用模块化）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API_ENDPOINTS, getApiUrl };
}
