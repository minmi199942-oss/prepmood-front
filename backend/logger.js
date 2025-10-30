// ====================================
// 백엔드용 Logger 시스템
// ====================================

/**
 * 백엔드용 Logger 시스템
 * 프로덕션에서도 중요한 이벤트는 로깅
 * 단, 민감 정보(stack trace 등)는 제외
 */
const Logger = {
  isDevelopment: process.env.NODE_ENV !== 'production',
  
  log: function(...args) {
    // 프로덕션에서도 중요 이벤트 로깅 (모드 표시)
    if (!this.isDevelopment) {
      // 프로덕션: 중요한 이벤트만
      if (args[0]?.includes?.('✅') || args[0]?.includes?.('📋')) {
        console.log(...args);
      }
    } else {
      console.log(...args);
    }
  },
  
  error: function(...args) {
    // 에러는 항상 로깅 (디버깅 필요)
    if (this.isDevelopment) {
      console.error(...args);
    } else {
      // 프로덕션: stack trace 제외
      const message = args[0];
      console.error('❌ Error:', message, args.slice(1));
    }
  },
  
  warn: function(...args) {
    // 프로덕션에서도 경고 로깅
    console.warn(...args);
  },
  
  info: function(...args) {
    if (this.isDevelopment) {
      console.info(...args);
    }
  }
};

module.exports = Logger;
