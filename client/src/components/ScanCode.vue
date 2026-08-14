<template>
  <view v-if="visible" class="scan-code-overlay" @click.self="handleClose">
    <view class="scan-code-container">
      <!-- ==================== Header ==================== -->
      <view class="scan-header">
        <text class="scan-title">扫码核销</text>
        <view class="scan-close" @click="handleClose">
          <text class="scan-close-icon">✕</text>
        </view>
      </view>

      <!-- ==================== Camera Preview Area ==================== -->
      <view class="scan-camera-area">
        <!-- Scan Frame -->
        <view class="scan-frame">
          <view class="corner tl"></view>
          <view class="corner tr"></view>
          <view class="corner bl"></view>
          <view class="corner br"></view>
        </view>

        <!-- Instruction -->
        <text class="scan-instruction">对准核销码，自动扫描</text>

        <!-- Scan Line Animation -->
        <view class="scan-line"></view>
      </view>

      <!-- ==================== Toolbar ==================== -->
      <view class="scan-toolbar">
        <view class="toolbar-item" @click="toggleFlashlight">
          <text class="toolbar-icon">{{ flashlightOn ? '🔦' : '💡' }}</text>
          <text class="toolbar-text">{{ flashlightOn ? '关闭手电' : '打开手电' }}</text>
        </view>

        <view class="toolbar-item" @click="chooseFromAlbum">
          <text class="toolbar-icon">🖼️</text>
          <text class="toolbar-text">相册选择</text>
        </view>
      </view>

      <!-- ==================== Manual Input ==================== -->
      <view class="manual-input-section">
        <view class="manual-input-bar" @click="showManualInput">
          <text class="manual-icon">⌨️</text>
          <text class="manual-text">手动输入核销码</text>
        </view>
      </view>

      <!-- ==================== Manual Input Modal ==================== -->
      <view v-if="manualVisible" class="manual-modal-overlay" @click.self="manualVisible = false">
        <view class="manual-modal">
          <text class="manual-modal-title">手动输入核销码</text>
          <input
            v-model="codeInput"
            class="manual-input"
            placeholder="请输入或粘贴核销码"
            placeholder-style="color: #ccc;"
            maxlength="32"
            focus
          />
          <view class="manual-modal-btns">
            <view class="manual-btn cancel" @click="manualVisible = false">
              <text>取消</text>
            </view>
            <view class="manual-btn confirm" @click="handleManualSubmit">
              <text>确认核销</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, watch } from 'vue';
import { onUnmounted } from '@dcloudio/uni-app';

// ---- Props ----
const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
});

// ---- Emits ----
const emit = defineEmits(['success', 'close', 'error']);

// ---- State ----
const flashlightOn = ref(false);
const manualVisible = ref(false);
const codeInput = ref('');
let scanTimer = null;

// ---- Methods ----
function handleClose() {
  stopScanning();
  emit('close');
}

function toggleFlashlight() {
  flashlightOn.value = !flashlightOn.value;
  // Note: uni.scanCode doesn't support flashlight toggle directly in WeChat mini programs.
  // In native app mode, this would use plus API.
  uni.showToast({
    title: flashlightOn.value ? '手电筒已开启' : '手电筒已关闭',
    icon: 'none',
    duration: 1000
  });
}

function chooseFromAlbum() {
  // #ifdef MP-WEIXIN
  uni.scanCode({
    onlyFromCamera: false,
    scanType: ['qrCode', 'barCode'],
    success: (res) => {
      emit('success', res.result);
    },
    fail: (err) => {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        // User cancelled
        return;
      }
      emit('error', err);
    }
  });
  // #endif

  // #ifndef MP-WEIXIN
  uni.chooseImage({
    count: 1,
    sourceType: ['album'],
    success: (res) => {
      // In H5/app, we would pass the image to a QR decoder.
      // For now, show a prompt that manual input is available.
      uni.showToast({ title: '请使用手动输入核销码', icon: 'none' });
      setTimeout(() => {
        manualVisible.value = true;
      }, 1500);
    },
    fail: (err) => {
      if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        return;
      }
      // Fallback to manual input
      manualVisible.value = true;
    }
  });
  // #endif
}

function showManualInput() {
  manualVisible.value = true;
  codeInput.value = '';
}

function handleManualSubmit() {
  const code = codeInput.value.trim();
  if (!code) {
    uni.showToast({ title: '请输入核销码', icon: 'none' });
    return;
  }
  manualVisible.value = false;
  codeInput.value = '';
  emit('success', code);
}

function startScanning() {
  // #ifdef MP-WEIXIN
  // WeChat mini program: use uni.scanCode directly
  scanTimer = setTimeout(() => {
    uni.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode', 'barCode'],
      success: (res) => {
        emit('success', res.result);
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          // User cancelled - don't emit error, just close
          handleClose();
          return;
        }
        emit('error', err);
      }
    });
  }, 300); // Small delay to ensure the UI is visible
  // #endif

  // #ifndef MP-WEIXIN
  // For H5/app, we don't auto-trigger scan.
  // The user can use manual input or album selection.
  // We could use livePusher for H5 camera preview, but that's more complex.
  // #endif
}

function stopScanning() {
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}

// ---- Watchers ----
watch(() => props.visible, (newVal) => {
  if (newVal) {
    startScanning();
  } else {
    stopScanning();
  }
});

// ---- Lifecycle ----
onUnmounted(() => {
  stopScanning();
});
</script>

<style lang="scss" scoped>
.scan-code-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.9);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-code-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

// ===== Header =====
.scan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 32rpx;
  padding-top: calc(28rpx + env(safe-area-inset-top));
}

.scan-title {
  font-size: 34rpx;
  font-weight: 600;
  color: #FFFFFF;
}

.scan-close {
  width: 56rpx;
  height: 56rpx;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  .scan-close-icon { font-size: 28rpx; color: #FFFFFF; }
}

// ===== Camera Area =====
.scan-camera-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

// ===== Scan Frame =====
.scan-frame {
  width: 500rpx;
  height: 500rpx;
  position: relative;
}

.corner {
  position: absolute;
  width: 48rpx;
  height: 48rpx;
  border-color: #07C160;

  &.tl {
    top: 0; left: 0;
    border-left: 6rpx solid #07C160;
    border-top: 6rpx solid #07C160;
    animation: cornerPulse 1.5s ease-in-out infinite;
  }
  &.tr {
    top: 0; right: 0;
    border-right: 6rpx solid #07C160;
    border-top: 6rpx solid #07C160;
    animation: cornerPulse 1.5s ease-in-out 0.4s infinite;
  }
  &.bl {
    bottom: 0; left: 0;
    border-left: 6rpx solid #07C160;
    border-bottom: 6rpx solid #07C160;
    animation: cornerPulse 1.5s ease-in-out 0.8s infinite;
  }
  &.br {
    bottom: 0; right: 0;
    border-right: 6rpx solid #07C160;
    border-bottom: 6rpx solid #07C160;
    animation: cornerPulse 1.5s ease-in-out 1.2s infinite;
  }
}

@keyframes cornerPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// Instruction
.scan-instruction {
  position: absolute;
  top: calc(50% + 280rpx);
  left: 50%;
  transform: translateX(-50%);
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
}

// Scan line animation
.scan-line {
  position: absolute;
  top: calc(50% - 250rpx);
  left: 50%;
  transform: translateX(-50%);
  width: 460rpx;
  height: 4rpx;
  background: linear-gradient(90deg, transparent, #07C160, transparent);
  animation: scanMove 2.5s ease-in-out infinite;
}

@keyframes scanMove {
  0% { top: calc(50% - 250rpx); }
  50% { top: calc(50% + 250rpx); }
  100% { top: calc(50% - 250rpx); }
}

// ===== Toolbar =====
.scan-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 32rpx 48rpx;
}

.toolbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 16rpx 32rpx;
  &:active { opacity: 0.7; }
}

.toolbar-icon {
  font-size: 48rpx;
}

.toolbar-text {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.7);
}

// ===== Manual Input Section =====
.manual-input-section {
  padding: 16rpx 32rpx;
  padding-bottom: calc(32rpx + env(safe-area-inset-bottom));
}

.manual-input-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 24rpx;
  background-color: rgba(255, 255, 255, 0.08);
  border-radius: 16rpx;
  &:active { background-color: rgba(255, 255, 255, 0.12); }
}

.manual-icon {
  font-size: 32rpx;
}

.manual-text {
  font-size: 26rpx;
  color: rgba(255, 255, 255, 0.6);
}

// ===== Manual Input Modal =====
.manual-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.manual-modal {
  width: 580rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
}

.manual-modal-title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #1A1A1A;
  text-align: center;
  margin-bottom: 28rpx;
}

.manual-input {
  width: 100%;
  height: 88rpx;
  background-color: #F5F5F5;
  border-radius: 14rpx;
  padding: 0 20rpx;
  font-size: 30rpx;
  color: #333;
  letter-spacing: 2rpx;
  margin-bottom: 28rpx;
}

.manual-modal-btns {
  display: flex;
  gap: 16rpx;
}

.manual-btn {
  flex: 1;
  height: 80rpx;
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
  &.cancel {
    background-color: #F5F5F5;
    color: #666;
  }
  &.confirm {
    background: linear-gradient(135deg, #07C160, #05A84E);
    color: #FFFFFF;
  }
  &:active { opacity: 0.85; }
}
</style>
