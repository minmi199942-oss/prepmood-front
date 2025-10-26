// ====================================
// 백엔드용 Logger 시스템
// ====================================

/**
 * 백엔드용 Logger 시스템
 * 프로덕션에서는 console.log 비활성화하여 성능 향상
 */
const Logger = {
  isDevelopment: process.env.NODE_ENV !== 'production',
  
  log: function(...args) {
    if (this.isDevelopment) {
      console.log(...args);
    }
  },
  
  error: function(...args) {
    // 에러는 항상 로깅 (디버깅 필요)
    console.error(...args);
  },
  
  warn: function(...args) {
    if (this.isDevelopment) {
      console.warn(...args);
    }
  },
  
  info: function(...args) {
    if (this.isDevelopment) {
      console.info(...args);
    }
  }
};

module.exports = Logger;
