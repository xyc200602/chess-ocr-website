#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
国际象棋手写记录识别系统 - Python API服务器
Chess Notation OCR System - Python API Server
"""

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import tempfile
import re
import base64
import jwt
import requests
import mimetypes
from datetime import datetime
from werkzeug.utils import secure_filename
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
import chess
import chess.pgn
from dotenv import load_dotenv

# 加载.env文件
load_dotenv()

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

# 配置
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'bmp'}
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB

# 确保上传目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ==================== Chess Notation Parser ====================

class ChessNotationParser:
    """国际象棋记谱解析器"""
    
    def __init__(self):
        self.pieces = ['K', 'Q', 'R', 'B', 'N']
        self.files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
        self.ranks = ['1', '2', '3', '4', '5', '6', '7', '8']
        self.build_patterns()
    
    def build_patterns(self):
        """构建正则表达式模式"""
        # 王车易位
        self.castling_pattern = re.compile(r'(O-O-O|O-O|0-0-0|0-0)')
        
        # 常规着法模式
        piece = r'[KQRBN]?'
        disambiguator = r'[a-h]?[1-8]?'
        capture = r'x?'
        destination = r'[a-h][1-8]'
        promotion = r'(=[QRBN])?'
        check_mate = r'[+#]?'
        
        self.move_pattern = re.compile(
            f'({piece}{disambiguator}{capture}{destination}{promotion}{check_mate})',
            re.IGNORECASE
        )
        
        # 带编号的着法模式: "1. e4 e5" 或 "1.e4 e5"
        self.numbered_move_pattern = re.compile(r'(\d+)\.\s*([^\d]+)')
    
    def preprocess_image(self, image_path):
        """预处理图像以提高OCR识别率"""
        try:
            output_path = image_path.rsplit('.', 1)[0] + '_processed.png'
            
            # 打开图像
            img = Image.open(image_path)
            
            # 转换为灰度
            if img.mode != 'L':
                img = img.convert('L')
            
            # 增强对比度
            enhancer = ImageEnhance.Contrast(img)
            img = enhancer.enhance(2.0)
            
            # 锐化
            img = img.filter(ImageFilter.SHARPEN)
            
            # 保存处理后的图像
            img.save(output_path)
            
            return output_path
        except Exception as e:
            print(f'图像预处理失败: {e}')
            return image_path  # 失败时返回原图
    
    def clean_text(self, text):
        """清理和规范化文本"""
        # 转换为大写
        text = text.upper()
        
        # 替换常见OCR错误
        replacements = [
            (r'０', '0'),  # 全角数字
            (r'１', '1'),
            (r'２', '2'),
            (r'３', '3'),
            (r'４', '4'),
            (r'５', '5'),
            (r'６', '6'),
            (r'７', '7'),
            (r'８', '8'),
            (r'９', '9'),
            (r'，', ','),
            (r'\s+', ' '),  # 规范化空白字符
        ]
        
        for pattern, replacement in replacements:
            text = re.sub(pattern, replacement, text)
        
        # 只保留国际象棋相关字符
        text = re.sub(r'[^A-Z0-9\.\-\+\#=\s\/xO]', ' ', text)
        
        return text.strip()
    
    def extract_numbered_moves(self, text):
        """提取带编号的着法"""
        moves = []
        
        for match in self.numbered_move_pattern.finditer(text):
            move_text = match.group(2)
            # 按空格分割并过滤
            individual_moves = [m.strip() for m in move_text.split() if m.strip()]
            
            for move in individual_moves:
                if self.is_valid_move(move):
                    moves.append(move)
        
        return moves
    
    def extract_all_moves(self, text):
        """提取所有着法"""
        moves = []
        
        # 提取常规着法
        for match in self.move_pattern.finditer(text):
            moves.append(match.group(0))
        
        # 提取王车易位
        for match in self.castling_pattern.finditer(text):
            moves.append(match.group(0))
        
        return moves
    
    def extract_simple_moves(self, text):
        """提取简单着法（备用方法）"""
        moves = []
        
        # 查找王车易位
        castling_matches = self.castling_pattern.findall(text)
        moves.extend(castling_matches)
        
        # 查找简单方格模式 (例如: "e4", "Nf3")
        simple_pattern = re.compile(r'[KQRBN]?[a-h][1-8][+#]?', re.IGNORECASE)
        simple_moves = simple_pattern.findall(text)
        moves.extend(simple_moves)
        
        return moves
    
    def is_valid_move(self, move):
        """检查着法是否有效"""
        # 检查王车易位
        if re.match(r'^(O-O|O-O-O|0-0|0-0-0)$', move, re.IGNORECASE):
            return True
        
        # 检查是否符合一般着法模式
        return bool(self.move_pattern.match(move))
    
    def validate_and_clean_moves(self, moves):
        """验证和清理着法列表"""
        unique_moves = []
        seen = set()
        
        for move in moves:
            normalized = move.upper().strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                unique_moves.append(normalized)
        
        return unique_moves
    
    def parse_text(self, text):
        """解析文本提取着法"""
        print('开始解析文本...')
        print(f'原始文本长度: {len(text)}')
        
        # 步骤1: 清理和规范化文本
        text = self.clean_text(text)
        print(f'清理后文本: {text[:200]}')
        
        # 步骤2: 尝试多种解析策略
        moves = []
        
        # 策略1: 提取带编号的着法
        moves = self.extract_numbered_moves(text)
        if moves:
            print(f'使用编号着法模式提取了 {len(moves)} 个着法')
            return self.validate_and_clean_moves(moves)
        
        # 策略2: 提取所有国际象棋着法
        moves = self.extract_all_moves(text)
        if moves:
            print(f'使用全部着法模式提取了 {len(moves)} 个着法')
            return self.validate_and_clean_moves(moves)
        
        # 策略3: 备用 - 查找王车易位和简单方格
        moves = self.extract_simple_moves(text)
        print(f'使用简单模式提取了 {len(moves)} 个着法')
        return self.validate_and_clean_moves(moves)
    
    def generate_pgn(self, moves, metadata=None):
        """生成PGN格式"""
        if metadata is None:
            metadata = {}
        
        event = metadata.get('event', '?')
        site = metadata.get('site', '?')
        date = metadata.get('date', datetime.now().strftime('%Y.%m.%d'))
        round_num = metadata.get('round', '?')
        white = metadata.get('white', 'White')
        black = metadata.get('black', 'Black')
        result = metadata.get('result', '*')
        
        # PGN头部
        pgn = f'[Event "{event}"]\n'
        pgn += f'[Site "{site}"]\n'
        pgn += f'[Date "{date}"]\n'
        pgn += f'[Round "{round_num}"]\n'
        pgn += f'[White "{white}"]\n'
        pgn += f'[Black "{black}"]\n'
        pgn += f'[Result "{result}"]\n\n'
        
        # 格式化着法为对子
        move_number = 1
        formatted_moves = []
        
        for i in range(0, len(moves), 2):
            white_move = moves[i] if i < len(moves) else ''
            black_move = moves[i + 1] if i + 1 < len(moves) else ''
            
            if white_move:
                if black_move:
                    formatted_moves.append(f'{move_number}. {white_move} {black_move}')
                else:
                    formatted_moves.append(f'{move_number}. {white_move}')
                move_number += 1
        
        pgn += ' '.join(formatted_moves)
        if result != '*':
            pgn += ' ' + result
        
        return pgn


# ==================== GLM-4.6V Vision Service ====================

class GLMChessRecognizer:
    """GLM-4.6V 视觉识别服务"""
    
    def __init__(self):
        # 只从环境变量读取API密钥
        self.api_key = os.getenv('ZHIPU_API_KEY')
        self.model = os.getenv('ZHIPU_MODEL', 'glm-4.6v')
        self.api_url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
        
        if not self.api_key:
            raise ValueError('ZHIPU_API_KEY未配置。请在.env文件中设置ZHIPU_API_KEY。')
        
        # 检查API密钥格式（应该是 id.secret 格式）
        if '.' not in self.api_key:
            print('⚠️ 警告: API密钥格式可能不正确，应该是 id.secret 格式')
        else:
            parts = self.api_key.split('.')
            if len(parts) != 2:
                print('⚠️ 警告: API密钥格式可能不正确，应该是 id.secret 格式')
            else:
                print(f'✅ API密钥格式检查通过: {parts[0][:8]}...{parts[1][-4:]}')
    
    def recognize_chess_notation(self, image_path):
        """使用GLM-4.6V识别国际象棋记谱"""
        if not self.api_key:
            raise ValueError('ZHIPU_API_KEY未配置。请在.env文件中设置ZHIPU_API_KEY。')
        
        try:
            print('调用GLM-4.6V API...')
            print(f'使用模型: {self.model}')
            
            # 验证图片文件是否有效
            try:
                img = Image.open(image_path)
                img.verify()  # 验证图片完整性
                print(f'✅ 图片验证通过: {img.format}, 尺寸: {img.size}')
            except Exception as img_error:
                raise ValueError(f'图片文件无效或损坏: {str(img_error)}')
            
            # 重新打开图片（verify后需要重新打开）
            img = Image.open(image_path)
            
            # 将图片转换为RGB格式（如果不是的话）
            if img.mode != 'RGB':
                print(f'⚠️ 图片模式 {img.mode} 不是RGB，正在转换...')
                rgb_img = Image.new('RGB', img.size)
                rgb_img.paste(img)
                # 保存为临时JPEG文件
                temp_path = image_path + '.temp.jpg'
                rgb_img.save(temp_path, 'JPEG', quality=95)
                image_path = temp_path
                print(f'✅ 已转换为RGB格式并保存到: {temp_path}')
            
            # 将图像转换为base64
            with open(image_path, 'rb') as f:
                image_buffer = f.read()
            
            # 检查图片大小（智谱AI可能有大小限制）
            image_size_mb = len(image_buffer) / (1024 * 1024)
            print(f'图片原始大小: {len(image_buffer)} 字节 ({image_size_mb:.2f} MB)')
            
            # 如果图片太大，可能需要压缩
            if image_size_mb > 20:  # 如果超过20MB，压缩
                print(f'⚠️ 图片较大 ({image_size_mb:.2f} MB)，正在压缩...')
                img = Image.open(image_path)
                # 计算压缩比例，目标10MB以内
                scale = (10 * 1024 * 1024 / len(image_buffer)) ** 0.5
                new_size = (int(img.size[0] * scale), int(img.size[1] * scale))
                img_resized = img.resize(new_size, Image.Resampling.LANCZOS)
                temp_path = image_path + '.compressed.jpg'
                img_resized.save(temp_path, 'JPEG', quality=85)
                image_path = temp_path
                with open(image_path, 'rb') as f:
                    image_buffer = f.read()
                print(f'✅ 压缩后大小: {len(image_buffer)} 字节 ({len(image_buffer) / (1024 * 1024):.2f} MB)')
            
            base64_image = base64.b64encode(image_buffer).decode('utf-8')
            print(f'图像已转换为base64，base64长度: {len(base64_image)} 字符')
            
            # 根据实际图片格式确定MIME类型
            img = Image.open(image_path)
            format_to_mime = {
                'JPEG': 'image/jpeg',
                'PNG': 'image/png',
                'GIF': 'image/gif',
                'WEBP': 'image/webp',
                'BMP': 'image/bmp'
            }
            mime = format_to_mime.get(img.format, 'image/jpeg')
            
            # 如果mimetypes识别失败，使用图片实际格式
            if mime == 'image/jpeg':
                guessed_mime, _ = mimetypes.guess_type(image_path) or (None, None)
                if guessed_mime and guessed_mime.startswith('image/'):
                    mime = guessed_mime
            
            print(f'图片MIME类型: {mime} (格式: {img.format})')
            
            # 构建data URL格式（智谱AI要求：data:image/xxx;base64,xxxx）
            # 根据智谱AI API文档，image_url必须是可下载的http/https地址或data-url格式
            image_data_url = f'data:{mime};base64,{base64_image}'
            
            # 准备提示词
            prompt = '识别国际象棋棋谱，直接输出招法。格式示例：1. e4 e5 2. Nf3 Nc6'
            
            # 准备API请求
            request_data = {
                'model': self.model,
                'messages': [
                    {
                        'role': 'user',
                        'content': [
                            {
                                'type': 'image_url',
                                'image_url': {
                                    'url': image_data_url  # 使用data URL格式：data:image/xxx;base64,xxxx
                                }
                            },
                            {
                                'type': 'text',
                                'text': prompt
                            }
                        ]
                    }
                ],
                'temperature': 0.1,
                'max_tokens': 5000,
            }
            
            # 智谱AI v4 API认证格式
            # 根据官方文档，v4 API应该使用 Bearer {api_key} 格式
            # 但根据之前的反馈，可能需要 Bearer ZHIPU-AI:{api_key} 格式
            # 先尝试标准格式，如果401错误再尝试ZHIPU-AI前缀格式
            
            authorization = f'Bearer {self.api_key}'
            print(f'使用标准Bearer token格式进行鉴权 (API Key长度: {len(self.api_key)})')
            
            # 检查API密钥格式
            if '.' in self.api_key:
                parts = self.api_key.split('.', 1)
                if len(parts) == 2:
                    print(f'检测到 id.secret 格式的API密钥: {parts[0][:8]}...{parts[1][-4:]}')
            
            # 打印请求详情（用于debug）
            print('=' * 60)
            print('GLM-4.6V API 请求详情:')
            print(f'  URL: {self.api_url}')
            print(f'  模型: {self.model}')
            print(f'  图片路径: {image_path}')
            print(f'  图片MIME类型: {mime}')
            print(f'  图片base64长度: {len(base64_image)} 字符')
            print(f'  提示词: {prompt}')
            print(f'  temperature: {request_data["temperature"]}')
            print(f'  max_tokens: {request_data["max_tokens"]}')
            print(f'  请求体大小: {len(str(request_data))} 字符')
            # 打印请求体结构（不包含完整的base64数据）
            request_data_debug = request_data.copy()
            if 'messages' in request_data_debug and len(request_data_debug['messages']) > 0:
                if 'content' in request_data_debug['messages'][0]:
                    for item in request_data_debug['messages'][0]['content']:
                        if item.get('type') == 'image_url' and 'image_url' in item:
                            # 只显示base64的前50个字符用于验证
                            url_preview = item['image_url']['url'][:100] + '...' if len(item['image_url']['url']) > 100 else item['image_url']['url']
                            item['image_url']['url'] = url_preview
            print(f'  请求体结构: {request_data_debug}')
            # 根据实际使用的authorization格式显示
            auth_display = authorization.replace(self.api_key, "*" * (len(self.api_key) - 4) + self.api_key[-4:] if len(self.api_key) > 4 else "****")
            print(f'  Authorization头: {auth_display}')
            print('=' * 60)
            
            # 发送API请求（增加超时时间到120秒，因为GLM-4.6V处理图片可能需要更长时间）
            print('发送API请求，超时时间设置为120秒...')
            response = requests.post(
                self.api_url,
                json=request_data,
                headers={
                    'Authorization': authorization,
                    'Content-Type': 'application/json'
                },
                timeout=120  # 增加到120秒
            )
            
            print(f'响应状态: {response.status_code}')
            print(f'响应头: {dict(response.headers)}')
            
            if response.status_code != 200:
                print('=' * 60)
                print('GLM-4.6V API 错误响应详情:')
                print(f'  状态码: {response.status_code}')
                print(f'  响应头: {dict(response.headers)}')
                try:
                    error_data = response.json()
                    print(f'  错误响应体: {error_data}')
                    error_msg = error_data.get('error', {}).get('message', str(error_data))
                except:
                    error_data = {}
                    print(f'  响应文本: {response.text[:500]}')  # 只打印前500字符
                    error_msg = response.text[:200] if response.text else '未知错误'
                print('=' * 60)
                
                # 如果是400错误且是图片格式问题，尝试直接使用base64（不使用data URL）
                if response.status_code == 400 and '图片' in error_msg:
                    print('⚠️ 400图片格式错误，尝试直接使用base64字符串（不使用data URL）...')
                    # 重新构建请求，直接使用base64字符串
                    request_data_retry = request_data.copy()
                    if 'messages' in request_data_retry and len(request_data_retry['messages']) > 0:
                        if 'content' in request_data_retry['messages'][0]:
                            for item in request_data_retry['messages'][0]['content']:
                                if item.get('type') == 'image_url' and 'image_url' in item:
                                    # 直接使用base64字符串，不包含data URL前缀
                                    item['image_url']['url'] = base64_image
                                    print(f'使用直接base64格式，长度: {len(base64_image)} 字符')
                    
                    response_retry = requests.post(
                        self.api_url,
                        json=request_data_retry,
                        headers={
                            'Authorization': authorization,
                            'Content-Type': 'application/json'
                        },
                        timeout=120
                    )
                    
                    print(f'重试后响应状态: {response_retry.status_code}')
                    if response_retry.status_code == 200:
                        print('✅ 使用直接base64格式成功！')
                        response = response_retry
                    else:
                        print(f'❌ 重试后仍然失败: {response_retry.status_code}')
                        try:
                            retry_error = response_retry.json()
                            print(f'重试错误详情: {retry_error}')
                        except:
                            print(f'重试错误文本: {response_retry.text[:200]}')
                        raise ValueError(f'GLM-4.6V API错误: {error_msg} (尝试直接base64格式后仍然失败)')
                
                # 如果是401错误，尝试使用ZHIPU-AI前缀格式
                elif response.status_code == 401:
                    print('⚠️ 401身份验证失败，尝试使用ZHIPU-AI前缀格式重新认证...')
                    authorization_retry = f'Bearer ZHIPU-AI:{self.api_key}'
                    print(f'重试认证格式: Bearer ZHIPU-AI:{"*" * (len(self.api_key) - 4) + self.api_key[-4:] if len(self.api_key) > 4 else "****"}')
                    
                    # 重新发送请求
                    response_retry = requests.post(
                        self.api_url,
                        json=request_data,
                        headers={
                            'Authorization': authorization_retry,
                            'Content-Type': 'application/json'
                        },
                        timeout=120
                    )
                    
                    print(f'重试后响应状态: {response_retry.status_code}')
                    if response_retry.status_code == 200:
                        print('✅ 使用ZHIPU-AI前缀格式认证成功！')
                        response = response_retry
                    else:
                        print(f'❌ 重试后仍然失败: {response_retry.status_code}')
                        try:
                            retry_error = response_retry.json()
                            print(f'重试错误详情: {retry_error}')
                        except:
                            print(f'重试错误文本: {response_retry.text[:200]}')
                        raise ValueError(f'GLM-4.6V API错误: {error_msg} (尝试ZHIPU-AI前缀格式后仍然失败，请检查API密钥是否正确)')
                else:
                    raise ValueError(f'GLM-4.6V API错误: {error_msg}')
            
            response_data = response.json()
            
            # 打印响应详情（用于debug）
            print('=' * 60)
            print('GLM-4.6V API 响应详情:')
            print(f'  响应状态: {response.status_code}')
            print(f'  完整响应数据键: {list(response_data.keys())}')
            if 'usage' in response_data:
                print(f'  Token使用: {response_data["usage"]}')
            if 'choices' in response_data:
                print(f'  返回choices数量: {len(response_data["choices"])}')
                if len(response_data["choices"]) > 0:
                    choice = response_data["choices"][0]
                    print(f'  第一个choice的键: {list(choice.keys())}')
                    if 'message' in choice:
                        print(f'  message的键: {list(choice["message"].keys())}')
                        print(f'  message.role: {choice["message"].get("role")}')
                        print(f'  message.content类型: {type(choice["message"].get("content"))}')
                        print(f'  message.content值: {repr(choice["message"].get("content")[:200])}')
                    if 'finish_reason' in choice:
                        print(f'  finish_reason: {choice["finish_reason"]}')
                        if choice["finish_reason"] == "length":
                            print('  ⚠️ 警告: 响应被截断（达到max_tokens限制）')
            print('=' * 60)
            
            # 提取响应
            if response_data.get('choices') and len(response_data['choices']) > 0:
                choice = response_data['choices'][0]
                
                # 检查finish_reason
                finish_reason = choice.get('finish_reason')
                if finish_reason == 'length':
                    print('⚠️ 警告: 响应内容可能被截断，因为达到了max_tokens限制（5000）')
                    print('建议: 可以尝试增加max_tokens或分段识别')
                
                # 提取content
                message = choice.get('message', {})
                content = message.get('content', '')
                
                # 如果content是None或空字符串，尝试其他可能的字段
                if not content:
                    print('⚠️ 警告: message.content为空，检查其他可能的字段...')
                    print(f'  完整choice数据: {choice}')
                    print(f'  完整message数据: {message}')
                    # 有些API可能返回content在其他位置
                    if 'text' in message:
                        content = message['text']
                        print(f'  从message.text获取内容: {len(content)} 字符')
                    elif 'delta' in choice and 'content' in choice['delta']:
                        content = choice['delta']['content']
                        print(f'  从choice.delta.content获取内容: {len(content)} 字符')
                
                print(f'GLM-4.6V响应内容长度: {len(content) if content else 0} 字符')
                if content:
                    print(f'GLM-4.6V响应内容: {content[:500]}{"..." if len(content) > 500 else ""}')
                else:
                    print('❌ GLM-4.6V响应内容为空！')
                    print(f'  完整响应数据: {response_data}')
                    # 如果content为空，尝试从原始响应文本中提取
                    try:
                        raw_response_text = response.text
                        print(f'  原始响应文本长度: {len(raw_response_text)} 字符')
                        print(f'  原始响应文本前500字符: {raw_response_text[:500]}')
                    except:
                        pass
                    raise ValueError('GLM-4.6V API返回空内容，请检查响应数据')
                
                # 从响应中提取着法
                moves = self.extract_moves(content)
                print(f'提取的着法数量: {len(moves)}')
                print(f'提取的着法: {moves}')
                
                return {
                    'success': True,
                    'text': content,
                    'moves': moves,
                    'usage': response_data.get('usage')
                }
            else:
                print('=' * 60)
                print('GLM-4.6V API 无效响应详情:')
                print(f'  响应数据: {response_data}')
                print('=' * 60)
                raise ValueError('GLM-4.6V API返回无效响应')
        
        except Exception as e:
            print(f'GLM-4.6V API错误详情: {str(e)}')
            raise ValueError(f'GLM-4.6V识别失败: {str(e)}')
    
    def extract_moves(self, text):
        """从文本中提取着法"""
        print(f'原始提取文本: {text}')
        
        # 清理文本
        text = text.strip()
        text = re.sub(r'^(这里是|以下是|棋谱|对局|记录).*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'(结果|胜负|结束|完).*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'[\r\n]+', ' ', text)
        text = re.sub(r'\([^)]*\)', '', text)
        text = text.strip()
        
        print(f'清理后文本: {text}')
        
        moves = []
        
        # 策略1: 提取带编号的着法
        numbered_moves = re.findall(r'(\d+\.\s*[^0-9]+?)(?=\s+\d+\.|$)', text)
        
        if numbered_moves:
            print(f'找到 {len(numbered_moves)} 个编号着法块')
            
            for block in numbered_moves:
                move_text = re.sub(r'^\d+\.\s*', '', block).strip()
                tokens = move_text.split()
                for token in tokens:
                    clean_move = token.strip()
                    final_move = re.sub(r'[.,，。、]+$', '', clean_move)
                    
                    if final_move and self.is_valid_chess_move(final_move):
                        moves.append(final_move)
                        print(f'  ✓ 添加: {final_move}')
        
        if moves:
            print(f'\n✅ 成功从编号记谱中提取了 {len(moves)} 个着法')
            return moves
        
        # 策略2: 使用模式匹配提取所有国际象棋着法
        print('\n未找到编号着法，提取所有有效着法...')
        chess_move_pattern = re.compile(
            r'\b(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\b',
            re.IGNORECASE
        )
        all_matches = chess_move_pattern.findall(text)
        
        if all_matches:
            for m in all_matches:
                clean_move = re.sub(r'[.,，。、]+$', '', m)
                if self.is_valid_chess_move(clean_move):
                    moves.append(clean_move)
        
        print(f'\n最终提取的着法 ({len(moves)} 个): {moves}')
        return moves
    
    def is_valid_chess_move(self, move):
        """检查是否为有效的国际象棋着法"""
        if not move or len(move) == 0:
            return False
        
        # 检查王车易位
        if re.match(r'^(O-O|O-O-O|0-0|0-0-0)$', move, re.IGNORECASE):
            return True
        
        # 清理着法
        move = re.sub(r'[.,，。、]+$', '', move).strip()
        
        # 检查常规着法
        move_pattern = re.compile(r'^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?$', re.IGNORECASE)
        return bool(move_pattern.match(move))


@app.route('/')
def index():
    """返回前端页面"""
    return send_file('public/index.html')

@app.route('/api/test-config', methods=['GET'])
def test_config():
    """测试API配置"""
    api_key = os.getenv('ZHIPU_API_KEY')
    if api_key:
        return jsonify({
            'configured': True,
            'message': 'Python API server is running, API key configured in .env'
        })
    else:
        return jsonify({
            'configured': False,
            'message': 'API key not found in .env file. Please configure ZHIPU_API_KEY in .env'
        })

@app.route('/upload', methods=['POST'])
def upload_file():
    """处理文件上传和识别"""
    try:
        # 检查文件是否存在
        if 'image' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file uploaded'
            }), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected'
            }), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'success': False,
                'error': 'Invalid file type. Please upload an image file.'
            }), 400
        
        # 保存文件
        filename = secure_filename(file.filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        file.save(filepath)
        
        # 获取请求参数
        method = request.form.get('method', 'glm')
        parser = ChessNotationParser()
        
        moves = []
        raw_text = ''
        confidence = 0
        
        try:
            if method == 'glm':
                # 使用GLM-4.6V进行识别
                print('使用GLM-4.6V进行国际象棋记谱识别...')
                
                # 检查环境变量中是否配置了API密钥
                if not os.getenv('ZHIPU_API_KEY'):
                    print('❌ 未配置API密钥')
                    return jsonify({
                        'success': False,
                        'error': '使用GLM-4.6V识别需要API密钥。请在.env文件中配置ZHIPU_API_KEY。'
                    }), 400
                
                print('✅ 从.env读取API密钥，创建GLM识别器...')
                glm_recognizer = GLMChessRecognizer()
                
                try:
                    print('📡 开始GLM-4.6V识别...')
                    result = glm_recognizer.recognize_chess_notation(filepath)
                    moves = result['moves']
                    raw_text = result['text']
                    print(f'✅ GLM-4.6V提取了 {len(moves)} 个着法')
                except Exception as glm_error:
                    print(f'❌ GLM-4.6V失败: {str(glm_error)}')
                    # 注释掉OCR fallback逻辑
                    # print('回退到Tesseract OCR...')
                    # processed_image_path = parser.preprocess_image(filepath)
                    # raw_text = pytesseract.image_to_string(
                    #     Image.open(processed_image_path),
                    #     config='--psm 6 -c tessedit_char_whitelist=0123456789abcdefghijklmnopqrstuvwxyzKQRBNx+-=O.#?'
                    # )
                    # moves = parser.parse_text(raw_text)
                    # if processed_image_path != filepath:
                    #     try:
                    #         os.unlink(processed_image_path)
                    #     except:
                    #         pass
                    # 直接抛出错误，不再fallback
                    raise glm_error
            else:
                # 使用传统OCR
                print('使用Tesseract OCR进行识别...')
                
                # 预处理图像
                print('预处理图像...')
                processed_image_path = parser.preprocess_image(filepath)
                print(f'图像已预处理: {processed_image_path}')
                
                # 执行OCR
                print('开始OCR识别...')
                raw_text = pytesseract.image_to_string(
                    Image.open(processed_image_path),
                    config='--psm 6 -c tessedit_char_whitelist=0123456789abcdefghijklmnopqrstuvwxyzKQRBNx+-=O.#?'
                )
                
                print(f'OCR原始结果: {raw_text[:200]}')
                
                # 解析国际象棋记谱
                moves = parser.parse_text(raw_text)
                print(f'解析的着法: {moves}')
                
                # 清理处理后的图像
                try:
                    if processed_image_path != filepath:
                        os.unlink(processed_image_path)
                except:
                    pass
            
            # 获取元数据
            metadata = {
                'event': request.form.get('event', '?'),
                'site': request.form.get('site', '?'),
                'date': request.form.get('date', datetime.now().strftime('%Y.%m.%d')),
                'round': request.form.get('round', '?'),
                'white': request.form.get('white', 'White'),
                'black': request.form.get('black', 'Black'),
                'result': request.form.get('result', '*')
            }
            
            # 生成PGN
            pgn = parser.generate_pgn(moves, metadata)
            
            # 清理上传的文件
            try:
                os.unlink(filepath)
            except:
                pass
            
            return jsonify({
                'success': True,
                'rawText': raw_text,
                'moves': moves,
                'pgn': pgn,
                'moveCount': len(moves),
                'confidence': confidence,
                'method': method
            })
        
        except Exception as e:
            # 清理文件
            try:
                if os.path.exists(filepath):
                    os.unlink(filepath)
            except:
                pass
            
            print(f'处理图片时出错: {str(e)}')
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/validate-moves', methods=['POST'])
def validate_moves():
    """验证棋谱招法"""
    try:
        data = request.get_json()
        moves = data.get('moves', [])
        
        if not moves or not isinstance(moves, list):
            return jsonify({
                'success': False,
                'error': 'Moves array is required'
            }), 400
        
        # 使用python-chess验证着法
        game = chess.Board()
        validation_results = []
        valid_positions = []
        last_valid_fen = game.fen()
        found_invalid = False
        
        # 保存初始局面
        valid_positions.append({
            'moveIndex': -1,
            'fen': game.fen(),
            'move': '初始局面'
        })
        
        for index, move in enumerate(moves):
            result = {
                'move': move,
                'moveNumber': index + 1,
                'isValid': False,
                'error': None
            }
            
            # 只有在还没遇到无效着法时才尝试执行
            if not found_invalid:
                try:
                    # 尝试执行着法
                    move_obj = game.parse_san(move)
                    if move_obj:
                        game.push(move_obj)
                        result['isValid'] = True
                        last_valid_fen = game.fen()
                        # 保存这个有效局面
                        valid_positions.append({
                            'moveIndex': index,
                            'fen': game.fen(),
                            'move': move
                        })
                    else:
                        result['isValid'] = False
                        result['error'] = 'Invalid move'
                        found_invalid = True
                except Exception as e:
                    result['isValid'] = False
                    result['error'] = str(e)
                    found_invalid = True
            else:
                # 标记所有后续着法为无效，不尝试执行
                result['isValid'] = False
                result['error'] = 'Skipped (previous move was invalid)'
            
            validation_results.append(result)
        
        # 统计有效和无效着法
        valid_moves = [r for r in validation_results if r['isValid']]
        invalid_moves = [r for r in validation_results if not r['isValid']]
        
        # 判断对局是否结束
        is_complete = game.is_game_over()
        result_str = '*'
        if game.is_checkmate():
            result_str = '0-1' if game.turn == chess.WHITE else '1-0'
        elif game.is_stalemate() or game.is_insufficient_material() or game.is_seventyfive_moves() or game.is_fivefold_repetition():
            result_str = '1/2-1/2'
        
        return jsonify({
            'success': True,
            'validation': validation_results,
            'validPositions': valid_positions,
            'summary': {
                'total': len(moves),
                'valid': len(valid_moves),
                'invalid': len(invalid_moves),
                'lastValidFen': last_valid_fen,
                'isComplete': is_complete,
                'result': result_str
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/fen-to-pgn', methods=['POST'])
def fen_to_pgn():
    """从FEN生成PGN"""
    try:
        data = request.get_json()
        fen = data.get('fen')
        moves = data.get('moves', [])
        
        if not fen:
            return jsonify({
                'success': False,
                'error': 'FEN is required'
            }), 400
        
        # 从FEN创建棋盘
        try:
            board = chess.Board(fen)
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Invalid FEN: {str(e)}'
            }), 400
        
        # 如果提供了着法，尝试重建对局
        if moves and isinstance(moves, list):
            temp_board = chess.Board()
            reconstructed_moves = []
            
            for move in moves:
                try:
                    move_obj = temp_board.parse_san(move)
                    if move_obj:
                        temp_board.push(move_obj)
                        reconstructed_moves.append(move)
                except:
                    pass
            
            # 生成PGN
            game = chess.pgn.Game()
            game.headers['Event'] = '?'
            game.headers['Site'] = '?'
            game.headers['Date'] = datetime.now().strftime('%Y.%m.%d')
            game.headers['Round'] = '?'
            game.headers['White'] = 'White'
            game.headers['Black'] = 'Black'
            game.headers['Result'] = '*'
            
            node = game
            for move in reconstructed_moves:
                try:
                    move_obj = node.board().parse_san(move)
                    node = node.add_variation(move_obj)
                except:
                    pass
            
            exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
            pgn_str = str(game.accept(exporter))
            
            return jsonify({
                'success': True,
                'pgn': pgn_str,
                'fen': temp_board.fen(),
                'moves': reconstructed_moves
            })
        
        # 只返回当前局面的PGN
        return jsonify({
            'success': True,
            'pgn': f'* (FEN: {fen})',
            'fen': fen,
            'moves': []
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/download-pgn', methods=['POST'])
def download_pgn():
    """下载PGN文件"""
    try:
        data = request.get_json()
        pgn = data.get('pgn')
        filename = data.get('filename', 'chess-game.pgn')
        
        if not pgn:
            return jsonify({
                'error': 'No PGN content provided'
            }), 400
        
        # 创建临时文件
        with tempfile.NamedTemporaryFile(mode='w', suffix='.pgn', delete=False, encoding='utf-8') as f:
            f.write(pgn)
            temp_path = f.name
        
        return send_file(
            temp_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/x-chess-pgn'
        )
        
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500

if __name__ == '__main__':
    print('=' * 50)
    print('国际象棋手写记录识别系统 - Python API服务器')
    print('Chess Notation OCR System - Python API Server')
    print('=' * 50)
    print(f'服务器运行在: http://localhost:3000')
    print('上传手写棋谱图片以转换为PGN格式!')
    print('=' * 50)
    app.run(host='0.0.0.0', port=3000, debug=True)
