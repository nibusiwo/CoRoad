<template>
  <view class="certify-page">
    <!-- ==================== Before Submission ==================== -->
    <template v-if="!submitted">
      <!-- Step Indicator -->
      <view class="step-indicator">
        <view class="step-track">
          <view class="track-bg"></view>
          <view
            class="track-fill"
            :style="{ width: ((currentStep - 1) / 2 * 100) + '%' }"
          ></view>
        </view>
        <view class="step-labels">
          <view
            v-for="(step, index) in steps"
            :key="index"
            class="step-item"
            :class="{
              active: currentStep >= index + 1,
              current: currentStep === index + 1
            }"
          >
            <view class="step-dot" :class="{ filled: currentStep > index + 1 }">
              <text v-if="currentStep > index + 1">✓</text>
              <text v-else>{{ index + 1 }}</text>
            </view>
            <text class="step-name">{{ step }}</text>
          </view>
        </view>
      </view>

      <!-- ========== Step 1: Upload Driving License ========== -->
      <scroll-view v-if="currentStep === 1" class="step-scroll" scroll-y>
        <view class="step-content">
          <view class="upload-section">
            <text class="section-title">行驶证照片</text>

            <!-- Camera Capture Area -->
            <view
              v-if="!licenseImage"
              class="capture-area"
              @click="captureLicense"
            >
              <view class="capture-icon-wrap">
                <text class="capture-icon">📷</text>
              </view>
              <text class="capture-title">点击拍摄行驶证</text>
              <text class="capture-hint">请拍摄清晰的行驶证正本</text>
              <view class="capture-frame">
                <view class="frame-corner top-left"></view>
                <view class="frame-corner top-right"></view>
                <view class="frame-corner bottom-left"></view>
                <view class="frame-corner bottom-right"></view>
              </view>
            </view>

            <!-- Preview -->
            <view v-else class="preview-area">
                            <view class="license-preview">
                <local-image style="width:100%;height:100%;"
                :src="licenseImage"
               
                mode="aspectFit"
               />
              </view>
              <view class="preview-actions">
                <view class="preview-btn retake" @click="retakeLicense">
                  <text>重新拍摄</text>
                </view>
                <view class="preview-btn confirm" @click="confirmLicense">
                  <text>✓ 确认使用</text>
                </view>
              </view>
            </view>
          </view>

          <!-- Guidance -->
          <view class="guidance-card">
            <text class="guidance-title">💡 拍摄提示</text>
            <view class="guidance-list">
              <text class="guidance-item">1. 确保光线充足，避免反光</text>
              <text class="guidance-item">2. 行驶证正本完整出现在画面中</text>
              <text class="guidance-item">3. 文字清晰可辨，无遮挡</text>
              <text class="guidance-item">4. 建议竖屏拍摄</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- ========== Step 2: Face Recognition ========== -->
      <scroll-view v-if="currentStep === 2" class="step-scroll" scroll-y>
        <view class="step-content">
          <view class="face-section">
            <text class="section-title">人脸识别</text>

            <!-- Face Detection Area -->
            <view class="face-area">
              <view class="face-frame">
                <view class="face-guide-text" v-if="!faceDetected">
                  <text>请将面部对准框内</text>
                </view>
                <view class="face-guide-text detected" v-else>
                  <text>✓ 面部已识别</text>
                </view>

                <!-- Face outline oval -->
                <view class="face-oval">
                  <view class="face-scan-line" v-if="!faceDetected"></view>
                </view>

                <!-- Live detection status -->
                <view class="face-status">
                  <view
                    class="face-status-item"
                    v-for="action in faceActions"
                    :key="action.key"
                    :class="{ completed: action.done }"
                  >
                    <view class="status-dot" :class="{ done: action.done }"></view>
                    <text>{{ action.label }}</text>
                    <text v-if="action.done" class="status-check">✓</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- Start / Retry -->
            <view class="face-controls">
              <view
                v-if="!faceActive"
                class="start-face-btn"
                @click="startFaceRecognition"
              >
                <text>🔍 开始人脸识别</text>
              </view>
              <view v-else class="face-progress">
                <text class="face-progress-text">正在进行活体检测...</text>
                <view class="face-progress-bar">
                  <view
                    class="face-progress-fill"
                    :style="{ width: faceProgress + '%' }"
                  ></view>
                </view>
              </view>
            </view>
          </view>

          <!-- Guidance -->
          <view class="guidance-card">
            <text class="guidance-title">📋 人脸识别说明</text>
            <view class="guidance-list">
              <text class="guidance-item">1. 请确保为本人操作</text>
              <text class="guidance-item">2. 保持正脸对准摄像头</text>
              <text class="guidance-item">3. 按提示完成眨眼、张嘴等动作</text>
              <text class="guidance-item">4. 请勿佩戴帽子或口罩</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- ========== Step 3: Review & Submit ========== -->
      <scroll-view v-if="currentStep === 3" class="step-scroll" scroll-y>
        <view class="step-content">
          <view class="review-card">
            <text class="review-title">认证信息确认</text>

            <!-- License Image -->
            <view class="review-section">
              <text class="review-label">行驶证照片</text>
                            <view class="review-license-thumb">
                <local-image style="width:100%;height:100%;"
                v-if="licenseImage"
                :src="licenseImage"
               
                mode="aspectFill"
               />
                <text v-else class="review-missing">未上传</text>
              </view>
            </view>

            <!-- Face Recognition -->
            <view class="review-section">
              <text class="review-label">人脸识别</text>
              <view class="review-status-row">
                <text v-if="faceDetected" class="review-ok">✓ 已通过</text>
                <text v-else class="review-missing">未完成</text>
              </view>
            </view>

            <!-- Vehicle Info -->
            <view class="review-section">
              <text class="review-label">车主信息</text>
              <view class="vehicle-info-row">
                <text class="vi-label">认证状态</text>
                <text class="vi-value pending">待提交</text>
              </view>
            </view>
          </view>

          <!-- Submit Note -->
          <view class="submit-note">
            <text class="note-title">📝 温馨提示</text>
            <text class="note-text">提交后预计 <text class="highlight">1-3个工作日</text> 内完成审核，审核结果将通过消息通知您。</text>
          </view>
        </view>
      </scroll-view>
    </template>

    <!-- ==================== After Submission: Success Page ==================== -->
    <template v-else>
      <view class="success-page">
        <view class="success-icon-wrap">
          <text class="success-icon">📋</text>
        </view>
        <text class="success-title">认证资料已提交</text>
        <view class="success-status">
          <view class="status-pill">
            <view class="status-pulse"></view>
            <text>审核中</text>
          </view>
        </view>
        <text class="success-desc">
          预计 <text class="highlight">1-3个工作日</text> 完成审核
        </text>
        <text class="success-hint">审核结果将通过消息通知您</text>

        <view class="success-actions">
          <view class="success-btn outline" @click="goBack">
            <text>返回我的页面</text>
          </view>
          <view class="success-btn primary" @click="goToMine">
            <text>查看认证状态</text>
          </view>
        </view>
      </view>
    </template>

    <!-- ==================== Bottom Navigation ==================== -->
    <view v-if="!submitted" class="bottom-bar safe-area-bottom">
      <view
        v-if="currentStep > 1"
        class="bottom-btn prev-btn"
        @click="prevStep"
      >
        <text>上一步</text>
      </view>
      <view
        v-if="currentStep < 3"
        class="bottom-btn next-btn"
        @click="nextStep"
      >
        <text>下一步</text>
      </view>
      <view
        v-if="currentStep === 3"
        class="bottom-btn submit-btn"
        :class="{ disabled: submitting }"
        @click="submitCertification"
      >
        <text>{{ submitting ? '提交中...' : '提交审核' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { userApi } from '@/utils/api.js';
import { useUserStore } from '@/store/user.js';

export default {
  data() {
    return {
      currentStep: 1,
      steps: ['上传行驶证', '人脸识别', '提交审核'],
      submitted: false,
      submitting: false,

      // License
      licenseImage: '',
      licenseFile: '',

      // Face
      faceDetected: false,
      faceActive: false,
      faceProgress: 0,
      faceActions: [
        { key: 'blink', label: '眨眼', done: false },
        { key: 'mouth', label: '张嘴', done: false },
        { key: 'turn', label: '转头', done: false }
      ],
      faceTimer: null
    };
  },

  beforeDestroy() {
    this.clearFaceTimer();
  },

  methods: {
    /** Navigate to previous step */
    prevStep() {
      if (this.currentStep > 1) {
        this.currentStep--;
      }
    },

    /** Navigate to next step with validation */
    nextStep() {
      if (!this.validateStep(this.currentStep)) return;
      if (this.currentStep < 3) {
        this.currentStep++;
      }
    },

    /** Validate current step */
    validateStep(step) {
      if (step === 1) {
        if (!this.licenseImage) {
          uni.showToast({ title: '请先拍摄行驶证照片', icon: 'none' });
          return false;
        }
      }
      if (step === 2) {
        if (!this.faceDetected) {
          uni.showToast({ title: '请先完成人脸识别', icon: 'none' });
          return false;
        }
      }
      return true;
    },

    // ---- Step 1: License Capture ----

    /** Capture driving license image */
    captureLicense() {
      uni.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['camera'],
        success: (res) => {
          this.licenseImage = res.tempFilePaths[0];
          this.licenseFile = res.tempFiles ? res.tempFiles[0] : null;
        },
        fail: () => {
          uni.showToast({ title: '拍摄取消', icon: 'none' });
        }
      });
    },

    /** Confirm license image */
    confirmLicense() {
      uni.showToast({ title: '行驶证已确认', icon: 'success' });
      this.nextStep();
    },

    /** Retake license */
    retakeLicense() {
      this.licenseImage = '';
      this.licenseFile = '';
      this.captureLicense();
    },

    // ---- Step 2: Face Recognition ----

    /** Start face recognition simulation */
    startFaceRecognition() {
      if (this.faceActive) return;
      this.faceActive = true;
      this.faceProgress = 0;
      this.faceActions.forEach((a) => { a.done = false; });

      // MVP: Simulate face detection steps
      this.simulateFaceDetection();
    },

    /** Simulate face detection sequence */
    simulateFaceDetection() {
      let step = 0;
      const totalSteps = 30; // ~3 seconds total

      this.clearFaceTimer();
      this.faceTimer = setInterval(() => {
        step++;
        this.faceProgress = Math.min(100, Math.round((step / totalSteps) * 100));

        if (step >= 8 && !this.faceActions[0].done) {
          this.faceActions[0].done = true;
        }
        if (step >= 16 && !this.faceActions[1].done) {
          this.faceActions[1].done = true;
        }
        if (step >= 24 && !this.faceActions[2].done) {
          this.faceActions[2].done = true;
        }

        if (step >= totalSteps) {
          this.clearFaceTimer();
          this.faceDetected = true;
          this.faceActive = false;
          uni.showToast({ title: '人脸识别通过 ✓', icon: 'success' });
        }
      }, 100);
    },

    /** Clear face detection timer */
    clearFaceTimer() {
      if (this.faceTimer) {
        clearInterval(this.faceTimer);
        this.faceTimer = null;
      }
    },

    // ---- Step 3: Submit ----

    /** Submit certification */
    async submitCertification() {
      if (this.submitting) return;
      this.submitting = true;

      try {
        // Upload license image first
        let licenseUrl = '';
        if (this.licenseFile) {
          // MVP: Use stored image path; actual upload would use api.upload
          licenseUrl = this.licenseImage;
        }

        // Call certification API
        await userApi.certifyVehicle({
          licenseImage: licenseUrl,
          faceVerified: this.faceDetected
        });

        // Update store
        const userStore = useUserStore();
        await userStore.certifyVehicle({ licenseImage: licenseUrl });

        this.submitted = true;
      } catch (err) {
        uni.showToast({ title: '提交失败，请重试', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },

    // ---- Navigation ----

    /** Go back to previous page */
    goBack() {
      uni.navigateBack();
    },

    /** Go to mine page */
    goToMine() {
      uni.switchTab({ url: '/pages/mine/index' });
    }
  }
};
</script>

<style lang="scss" scoped>
.certify-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--color-bg);
}

// ==================== Step Indicator ====================
.step-indicator {
  padding: 24rpx 32rpx;
  background-color: var(--color-bg-white);
  border-bottom: 1rpx solid var(--color-border);

  .step-track {
    position: relative;
    height: 4rpx;
    margin-bottom: 16rpx;

    .track-bg {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 100%;
      background-color: var(--color-divider);
      border-radius: 2rpx;
    }

    .track-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background-color: var(--color-primary);
      border-radius: 2rpx;
      transition: width 0.3s ease;
    }
  }

  .step-labels {
    display: flex;
    justify-content: space-around;

    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8rpx;
      opacity: 0.4;
      transition: opacity 0.2s;

      &.active {
        opacity: 1;
      }

      .step-dot {
        width: 44rpx;
        height: 44rpx;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--color-divider);
        font-size: var(--font-xs);
        color: var(--color-text-hint);
        transition: all 0.2s;

        &.filled {
          background-color: var(--color-primary);
          color: #fff;
        }
      }

      &.current .step-dot {
        background-color: var(--color-primary);
        color: #fff;
      }

      .step-name {
        font-size: var(--font-xs);
        color: var(--color-text-secondary);
      }
    }
  }
}

// ==================== Step Content ====================
.step-scroll {
  flex: 1;
}

.step-content {
  padding: 24rpx;
}

.section-title {
  display: block;
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 20rpx;
}

// ==================== Step 1: License Upload ====================
.upload-section {
  margin-bottom: 24rpx;
}

.capture-area {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 480rpx;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  border: 2rpx dashed var(--color-border);
  padding: 40rpx;
  overflow: hidden;

  &:active {
    opacity: 0.95;
  }
}

.capture-icon-wrap {
  width: 100rpx;
  height: 100rpx;
  border-radius: 50%;
  background-color: rgba(7, 193, 96, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20rpx;
}

.capture-icon {
  font-size: 48rpx;
}

.capture-title {
  font-size: var(--font-lg);
  color: var(--color-text-primary);
  font-weight: 500;
  margin-bottom: 8rpx;
}

.capture-hint {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
}

.capture-frame {
  position: absolute;
  top: 60rpx;
  left: 40rpx;
  right: 40rpx;
  bottom: 60rpx;

  .frame-corner {
    position: absolute;
    width: 40rpx;
    height: 40rpx;
    border-color: var(--color-primary);

    &.top-left {
      top: 0;
      left: 0;
      border-top: 4rpx solid var(--color-primary);
      border-left: 4rpx solid var(--color-primary);
    }

    &.top-right {
      top: 0;
      right: 0;
      border-top: 4rpx solid var(--color-primary);
      border-right: 4rpx solid var(--color-primary);
    }

    &.bottom-left {
      bottom: 0;
      left: 0;
      border-bottom: 4rpx solid var(--color-primary);
      border-left: 4rpx solid var(--color-primary);
    }

    &.bottom-right {
      bottom: 0;
      right: 0;
      border-bottom: 4rpx solid var(--color-primary);
      border-right: 4rpx solid var(--color-primary);
    }
  }
}

.preview-area {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  overflow: hidden;

  .license-preview {
    width: 100%;
    height: 480rpx;
    background-color: #E8E8E8;
  }

  .preview-actions {
    display: flex;
    gap: 16rpx;
    padding: 20rpx 24rpx;

    .preview-btn {
      flex: 1;
      height: 72rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      font-size: var(--font-sm);
      font-weight: 500;

      &:active {
        opacity: 0.85;
      }

      &.retake {
        background-color: var(--color-divider);
        color: var(--color-text-secondary);
      }

      &.confirm {
        background-color: var(--color-primary);
        color: #fff;
      }
    }
  }
}

// ==================== Step 2: Face Recognition ====================
.face-section {
  margin-bottom: 24rpx;
}

.face-area {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 40rpx 24rpx;
}

.face-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 500rpx;
}

.face-guide-text {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  margin-bottom: 40rpx;
  font-weight: 500;

  &.detected {
    color: var(--color-primary);
    font-weight: 600;
  }
}

.face-oval {
  width: 320rpx;
  height: 400rpx;
  border: 4rpx solid rgba(7, 193, 96, 0.3);
  border-radius: 50%;
  position: relative;
  overflow: hidden;
}

.face-scan-line {
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 4rpx;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
  animation: scanDown 1.5s ease-in-out infinite;
}

@keyframes scanDown {
  0% { top: 0; opacity: 0; }
  20% { opacity: 1; }
  80% { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}

.face-status {
  display: flex;
  gap: 24rpx;
  margin-top: 40rpx;
}

.face-status-item {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: var(--font-xs);
  color: var(--color-text-hint);

  &.completed {
    color: var(--color-primary);
  }

  .status-dot {
    width: 12rpx;
    height: 12rpx;
    border-radius: 50%;
    background-color: #E0E0E0;

    &.done {
      background-color: var(--color-primary);
    }
  }

  .status-check {
    font-size: 18rpx;
    font-weight: 600;
  }
}

.face-controls {
  margin-top: 32rpx;
}

.start-face-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 88rpx;
  background-color: var(--color-primary);
  color: #fff;
  font-size: var(--font-lg);
  font-weight: 500;
  border-radius: var(--radius-md);

  &:active {
    opacity: 0.85;
  }
}

.face-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;

  .face-progress-text {
    font-size: var(--font-sm);
    color: var(--color-text-secondary);
  }

  .face-progress-bar {
    width: 100%;
    height: 8rpx;
    background-color: var(--color-divider);
    border-radius: 4rpx;
    overflow: hidden;

    .face-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--color-primary), #4cd964);
      border-radius: 4rpx;
      transition: width 0.1s linear;
    }
  }
}

// ==================== Guidance Card ====================
.guidance-card {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  margin-bottom: 24rpx;
  border-left: 6rpx solid var(--color-info);

  .guidance-title {
    display: block;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 12rpx;
  }
}

.guidance-list {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.guidance-item {
  font-size: var(--font-xs);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

// ==================== Step 3: Review ====================
.review-card {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  box-shadow: var(--shadow-sm);

  .review-title {
    display: block;
    font-size: var(--font-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 24rpx;
  }
}

.review-section {
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--color-divider);

  &:last-child {
    border-bottom: none;
  }

  .review-label {
    display: block;
    font-size: var(--font-xs);
    color: var(--color-text-hint);
    margin-bottom: 10rpx;
  }
}

.review-license-thumb {
  width: 100%;
  height: 260rpx;
  border-radius: var(--radius-sm);
  background-color: #E8E8E8;
    overflow: hidden;
  }

.review-missing {
  font-size: var(--font-sm);
  color: var(--color-danger);
}

.review-ok {
  font-size: var(--font-sm);
  color: var(--color-primary);
  font-weight: 500;
}

.review-status-row {
  display: flex;
  align-items: center;
}

.vehicle-info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .vi-label {
    font-size: var(--font-sm);
    color: var(--color-text-secondary);
  }

  .vi-value {
    font-size: var(--font-sm);
    color: var(--color-text-primary);

    &.pending {
      color: #F5A623;
      font-weight: 500;
    }
  }
}

.submit-note {
  background-color: var(--color-bg-white);
  border-radius: var(--radius-md);
  padding: 24rpx;
  margin-top: 16rpx;
  border-left: 6rpx solid #F5A623;

  .note-title {
    display: block;
    font-size: var(--font-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 8rpx;
  }

  .note-text {
    font-size: var(--font-xs);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  .highlight {
    color: var(--color-warning);
    font-weight: 500;
  }
}

// ==================== Success Page ====================
.success-page {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60rpx 40rpx;
  background-color: var(--color-bg-white);
}

.success-icon-wrap {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background-color: rgba(7, 193, 96, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}

.success-icon {
  font-size: 64rpx;
}

.success-title {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 20rpx;
}

.success-status {
  margin-bottom: 16rpx;
}

.status-pill {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 10rpx 28rpx;
  background-color: rgba(245, 166, 35, 0.1);
  border: 1rpx solid rgba(245, 166, 35, 0.3);
  border-radius: 32rpx;
  font-size: var(--font-md);
  color: #F5A623;
  font-weight: 600;

  .status-pulse {
    width: 14rpx;
    height: 14rpx;
    border-radius: 50%;
    background-color: #F5A623;
    animation: pulse 1.5s ease-in-out infinite;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}

.success-desc {
  font-size: var(--font-md);
  color: var(--color-text-secondary);
  margin-bottom: 8rpx;
  text-align: center;

  .highlight {
    color: var(--color-warning);
    font-weight: 600;
  }
}

.success-hint {
  font-size: var(--font-xs);
  color: var(--color-text-hint);
  margin-bottom: 60rpx;
}

.success-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16rpx;

  .success-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 88rpx;
    border-radius: var(--radius-md);
    font-size: var(--font-lg);
    font-weight: 500;

    &:active {
      opacity: 0.85;
    }

    &.outline {
      background-color: transparent;
      border: 2rpx solid var(--color-border);
      color: var(--color-text-secondary);
    }

    &.primary {
      background-color: var(--color-primary);
      color: #fff;
    }
  }
}

// ==================== Bottom Bar ====================
.bottom-bar {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background-color: var(--color-bg-white);
  border-top: 1rpx solid var(--color-border);
  gap: 16rpx;

  .bottom-btn {
    flex: 1;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    font-size: var(--font-lg);
    font-weight: 500;

    &:active {
      opacity: 0.85;
    }
  }

  .prev-btn {
    background-color: var(--color-divider);
    color: var(--color-text-secondary);
  }

  .next-btn {
    background-color: var(--color-primary);
    color: #fff;
  }

  .submit-btn {
    flex: 1;
    height: 88rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
    font-size: var(--font-lg);
    font-weight: 500;
    background-color: var(--color-warning);
    color: #fff;

    &.disabled {
      opacity: 0.5;
    }
  }
}
</style>
