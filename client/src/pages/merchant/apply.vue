<template>
  <view class="apply-page">
    <!-- ==================== Step Indicator ==================== -->
    <view class="step-indicator">
      <view class="step-connector" :class="{ active: currentStep >= 2 }"></view>
      <view class="step-connector last" :class="{ active: currentStep >= 3 }"></view>

      <view class="step-item" :class="{ active: currentStep >= 1, current: currentStep === 1 }">
        <view class="step-circle">
          <text v-if="currentStep > 1">✓</text>
          <text v-else>1</text>
        </view>
        <text class="step-label">基本信息</text>
      </view>

      <view class="step-item" :class="{ active: currentStep >= 2, current: currentStep === 2 }">
        <view class="step-circle">
          <text v-if="currentStep > 2">✓</text>
          <text v-else>2</text>
        </view>
        <text class="step-label">上传资质</text>
      </view>

      <view class="step-item" :class="{ active: currentStep >= 3, current: currentStep === 3 }">
        <view class="step-circle">
          <text>3</text>
        </view>
        <text class="step-label">提交审核</text>
      </view>
    </view>

    <!-- ==================== Success Page ==================== -->
    <view v-if="submitted" class="success-section">
      <view class="success-icon-wrap">
        <text class="success-icon">✓</text>
      </view>
      <text class="success-title">提交成功</text>
      <text class="success-desc">您的商家入驻申请已提交，我们将在 1-3 个工作日内完成审核，请耐心等待。</text>
      <view class="success-actions">
        <view class="success-btn" @click="goHome">
          <text>返回管理后台</text>
        </view>
        <text class="cancel-btn" @click="goBack">返回首页</text>
      </view>
    </view>

    <!-- ==================== Form Steps ==================== -->
    <template v-if="!submitted">
      <!-- Step 1: Basic Info -->
      <scroll-view v-if="currentStep === 1" class="step-scroll" scroll-y>
        <view class="form-section card">
          <text class="section-title">基本信息</text>

          <!-- Merchant Name -->
          <view class="form-item">
            <text class="form-label">商家名称 <text class="required">*</text></text>
            <input
              v-model="form.name"
              class="form-input"
              placeholder="请输入商家名称"
              placeholder-style="color: #ccc;"
              maxlength="30"
            />
          </view>

          <!-- Merchant Type -->
          <view class="form-item">
            <text class="form-label">商家类型 <text class="required">*</text></text>
            <picker
              mode="selector"
              :value="typeIndex"
              :range="merchantTypes"
              @change="onTypeChange"
            >
              <view class="form-picker" :class="{ placeholder: !form.type }">
                <text>{{ form.type || '请选择商家类型' }}</text>
                <text class="picker-arrow">›</text>
              </view>
            </picker>
          </view>

          <!-- Phone -->
          <view class="form-item">
            <text class="form-label">联系电话 <text class="required">*</text></text>
            <input
              v-model="form.phone"
              class="form-input"
              type="number"
              placeholder="请输入联系电话"
              placeholder-style="color: #ccc;"
              maxlength="11"
            />
          </view>

          <!-- Address -->
          <view class="form-item">
            <text class="form-label">地址 <text class="required">*</text></text>
            <view class="form-picker" @click="chooseLocation">
              <text :class="{ placeholder: !form.address }">{{ form.address || '点击选择地址' }}</text>
              <text class="picker-arrow">📍</text>
            </view>
          </view>

          <!-- Business Hours -->
          <view class="form-item">
            <text class="form-label">营业时间</text>
            <view class="hours-row">
              <picker
                mode="time"
                :value="form.openTime"
                @change="(e) => form.openTime = e.detail.value"
              >
                <view class="hours-picker" :class="{ placeholder: !form.openTime }">
                  <text>{{ form.openTime || '开始时间' }}</text>
                </view>
              </picker>
              <text class="hours-sep">至</text>
              <picker
                mode="time"
                :value="form.closeTime"
                @change="(e) => form.closeTime = e.detail.value"
              >
                <view class="hours-picker" :class="{ placeholder: !form.closeTime }">
                  <text>{{ form.closeTime || '结束时间' }}</text>
                </view>
              </picker>
            </view>
          </view>

          <!-- Description -->
          <view class="form-item">
            <text class="form-label">商家描述</text>
            <textarea
              v-model="form.description"
              class="form-textarea"
              placeholder="请输入商家介绍（最少20字，最多200字）"
              placeholder-style="color: #ccc;"
              :maxlength="200"
              :auto-height="true"
            />
            <text class="char-count">{{ form.description.length }}/200</text>
          </view>

          <!-- Service Scope (for repair/rescue type) -->
          <view v-if="isServiceType" class="form-item">
            <text class="form-label">服务范围 <text class="required">*</text></text>
            <view class="checkbox-group">
              <view
                v-for="service in serviceOptions"
                :key="service.value"
                class="checkbox-item"
                :class="{ checked: form.services.includes(service.value) }"
                @click="toggleService(service.value)"
              >
                <view class="checkbox-box">
                  <text v-if="form.services.includes(service.value)">✓</text>
                </view>
                <text class="checkbox-label">{{ service.label }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="step-footer">
          <view class="next-btn" @click="goStep2">
            <text>下一步</text>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </scroll-view>

      <!-- Step 2: Upload Documents -->
      <scroll-view v-if="currentStep === 2" class="step-scroll" scroll-y>
        <view class="form-section card">
          <text class="section-title">上传资质</text>
          <text class="section-hint">请上传清晰、完整的证件照片，大小不超过5MB</text>

          <!-- Business License -->
          <view class="upload-item">
            <text class="upload-label">营业执照 <text class="required">*</text></text>
            <view class="upload-area" @click="uploadImage('businessLicense')">
              <template v-if="form.businessLicense">
                <image :src="form.businessLicense" class="upload-preview" mode="aspectFill" />
                <view class="upload-delete" @click.stop="removeImage('businessLicense')">
                  <text>✕</text>
                </view>
              </template>
              <template v-else>
                <text class="upload-icon">📄</text>
                <text class="upload-hint">点击上传营业执照</text>
              </template>
            </view>
          </view>

          <!-- Storefront Photo -->
          <view class="upload-item">
            <text class="upload-label">门头照 <text class="required">*</text></text>
            <view class="upload-area" @click="uploadImage('storefront')">
              <template v-if="form.storefront">
                <image :src="form.storefront" class="upload-preview" mode="aspectFill" />
                <view class="upload-delete" @click.stop="removeImage('storefront')">
                  <text>✕</text>
                </view>
              </template>
              <template v-else>
                <text class="upload-icon">🏪</text>
                <text class="upload-hint">点击上传门头照</text>
              </template>
            </view>
          </view>

          <!-- Interior Photos -->
          <view class="upload-item">
            <text class="upload-label">店内环境 <text class="required">*</text></text>
            <view class="upload-area multi" @click="uploadImage('interior')">
              <template v-if="form.interior">
                <image :src="form.interior" class="upload-preview" mode="aspectFill" />
                <view class="upload-delete" @click.stop="removeImage('interior')">
                  <text>✕</text>
                </view>
              </template>
              <template v-else>
                <text class="upload-icon">🖼️</text>
                <text class="upload-hint">点击上传店内环境</text>
              </template>
            </view>
            <text class="upload-extra">可上传多张，建议3-5张</text>
          </view>

          <!-- ID Card Front -->
          <view class="upload-item">
            <text class="upload-label">身份证正面 <text class="required">*</text></text>
            <view class="upload-area" @click="uploadImage('idCardFront')">
              <template v-if="form.idCardFront">
                <image :src="form.idCardFront" class="upload-preview" mode="aspectFill" />
                <view class="upload-delete" @click.stop="removeImage('idCardFront')">
                  <text>✕</text>
                </view>
              </template>
              <template v-else>
                <text class="upload-icon">🪪</text>
                <text class="upload-hint">点击上传身份证正面</text>
              </template>
            </view>
          </view>
        </view>

        <view class="step-footer two-btns">
          <view class="prev-btn" @click="currentStep = 1">
            <text>上一步</text>
          </view>
          <view class="next-btn" @click="goStep3">
            <text>下一步</text>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </scroll-view>

      <!-- Step 3: Review & Submit -->
      <scroll-view v-if="currentStep === 3" class="step-scroll" scroll-y>
        <view class="review-section card">
          <text class="section-title">申请信息确认</text>

          <view class="review-block">
            <text class="review-block-title">基本信息</text>
            <view class="review-row">
              <text class="review-label">商家名称</text>
              <text class="review-value">{{ form.name || '--' }}</text>
            </view>
            <view class="review-row">
              <text class="review-label">商家类型</text>
              <text class="review-value">{{ form.type || '--' }}</text>
            </view>
            <view class="review-row">
              <text class="review-label">联系电话</text>
              <text class="review-value">{{ form.phone || '--' }}</text>
            </view>
            <view class="review-row">
              <text class="review-label">地址</text>
              <text class="review-value">{{ form.address || '--' }}</text>
            </view>
            <view class="review-row" v-if="form.openTime || form.closeTime">
              <text class="review-label">营业时间</text>
              <text class="review-value">{{ form.openTime || '--' }} - {{ form.closeTime || '--' }}</text>
            </view>
            <view class="review-row" v-if="form.description">
              <text class="review-label">商家描述</text>
              <text class="review-value">{{ form.description }}</text>
            </view>
            <view class="review-row" v-if="isServiceType && form.services.length">
              <text class="review-label">服务范围</text>
              <text class="review-value">{{ form.services.join('、') }}</text>
            </view>
          </view>

          <view class="review-block">
            <text class="review-block-title">资质文件</text>
            <view class="review-row">
              <text class="review-label">营业执照</text>
              <text class="review-value status">{{ form.businessLicense ? '已上传 ✅' : '未上传 ❌' }}</text>
            </view>
            <view class="review-row">
              <text class="review-label">门头照</text>
              <text class="review-value status">{{ form.storefront ? '已上传 ✅' : '未上传 ❌' }}</text>
            </view>
            <view class="review-row">
              <text class="review-label">店内环境</text>
              <text class="review-value status">{{ form.interior ? '已上传 ✅' : '未上传 ❌' }}</text>
            </view>
            <view class="review-row">
              <text class="review-label">身份证正面</text>
              <text class="review-value status">{{ form.idCardFront ? '已上传 ✅' : '未上传 ❌' }}</text>
            </view>
          </view>
        </view>

        <!-- Agreement -->
        <view class="agreement-section">
          <view class="agreement-row" @click="agreed = !agreed">
            <view class="agreement-checkbox" :class="{ checked: agreed }">
              <text v-if="agreed">✓</text>
            </view>
            <text class="agreement-text">
              我已阅读并同意
              <text class="agreement-link" @click.stop="showAgreement">《商家入驻协议》</text>
            </text>
          </view>
        </view>

        <view class="step-footer two-btns">
          <view class="prev-btn" @click="currentStep = 2">
            <text>上一步</text>
          </view>
          <view class="next-btn" :class="{ disabled: !canSubmit }" @click="handleSubmit">
            <text>提交审核</text>
          </view>
        </view>

        <view class="bottom-placeholder safe-area-bottom"></view>
      </scroll-view>
    </template>
  </view>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import api from '@/utils/api.js';

// ---- State ----
const currentStep = ref(1);
const submitted = ref(false);
const agreed = ref(false);

const merchantTypes = ['住宿', '餐饮', '加油', '维修', '露营', '购物', '救援'];
const typeIndex = ref(-1);

const serviceOptions = [
  { label: '修车', value: 'repair' },
  { label: '拖车', value: 'tow' },
  { label: '补胎', value: 'tire' },
  { label: '搭电', value: 'jumpstart' },
  { label: '送油', value: 'fuel' }
];

const form = reactive({
  name: '',
  type: '',
  phone: '',
  address: '',
  addressDetail: '',
  latitude: 0,
  longitude: 0,
  openTime: '',
  closeTime: '',
  description: '',
  services: [],
  // File uploads
  businessLicense: '',
  storefront: '',
  interior: '',
  idCardFront: ''
});

// ---- Computed ----
const isServiceType = computed(() => {
  return form.type === '维修' || form.type === '救援';
});

const canSubmit = computed(() => {
  return agreed.value;
});

// ---- Methods ----
// Step navigation
function goStep2() {
  if (!form.name.trim()) {
    uni.showToast({ title: '请输入商家名称', icon: 'none' });
    return;
  }
  if (!form.type) {
    uni.showToast({ title: '请选择商家类型', icon: 'none' });
    return;
  }
  if (!form.phone.trim()) {
    uni.showToast({ title: '请输入联系电话', icon: 'none' });
    return;
  }
  if (!form.address) {
    uni.showToast({ title: '请选择地址', icon: 'none' });
    return;
  }
  if (!form.description.trim() || form.description.trim().length < 20) {
    uni.showToast({ title: '商家描述至少20字', icon: 'none' });
    return;
  }
  if (isServiceType.value && form.services.length === 0) {
    uni.showToast({ title: '请选择服务范围', icon: 'none' });
    return;
  }
  currentStep.value = 2;
}

function goStep3() {
  if (!form.businessLicense) {
    uni.showToast({ title: '请上传营业执照', icon: 'none' });
    return;
  }
  if (!form.storefront) {
    uni.showToast({ title: '请上传门头照', icon: 'none' });
    return;
  }
  if (!form.interior) {
    uni.showToast({ title: '请上传店内环境', icon: 'none' });
    return;
  }
  if (!form.idCardFront) {
    uni.showToast({ title: '请上传身份证正面', icon: 'none' });
    return;
  }
  currentStep.value = 3;
}

function onTypeChange(e) {
  typeIndex.value = e.detail.value;
  form.type = merchantTypes[e.detail.value];
  // Reset services when type changes
  if (!isServiceType.value) {
    form.services = [];
  }
}

function chooseLocation() {
  uni.chooseLocation({
    success: (res) => {
      form.address = res.name || res.address;
      form.latitude = res.latitude;
      form.longitude = res.longitude;
    },
    fail: () => {
      uni.showToast({ title: '选择位置失败', icon: 'none' });
    }
  });
}

function toggleService(value) {
  const index = form.services.indexOf(value);
  if (index === -1) {
    form.services.push(value);
  } else {
    form.services.splice(index, 1);
  }
}

// File upload
function uploadImage(field) {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const filePath = res.tempFilePaths[0];
      // Show uploading state
      uni.showLoading({ title: '上传中...' });

          api.upload('/upload', filePath, { type: field }, { loadingText: '上传中...' })
        .then((uploadRes) => {
          uni.hideLoading();
          form[field] = uploadRes.url || uploadRes.filePath || filePath;
          uni.showToast({ title: '上传成功', icon: 'success' });
        })
        .catch((err) => {
          uni.hideLoading();
          console.error('Upload failed:', err);
          uni.showToast({ title: '上传失败，请重试', icon: 'none' });
        });
    }
  });
}

function removeImage(field) {
  form[field] = '';
}

// Submit
async function handleSubmit() {
  if (!canSubmit.value) {
    uni.showToast({ title: '请阅读并同意入驻协议', icon: 'none' });
    return;
  }

  uni.showModal({
    title: '确认提交',
    content: '提交后将进入审核流程，请确认信息无误。',
    confirmText: '确认提交',
    success: async (resModal) => {
      if (resModal.confirm) {
        uni.showLoading({ title: '提交中...' });
        try {
          const submitData = {
            name: form.name,
            type: form.type,
            phone: form.phone,
            address: form.address,
            latitude: form.latitude,
            longitude: form.longitude,
            openTime: form.openTime,
            closeTime: form.closeTime,
            description: form.description,
            services: form.services,
            businessLicense: form.businessLicense,
            storefront: form.storefront,
            interior: form.interior,
            idCardFront: form.idCardFront
          };

          await api.post('/merchants/apply', submitData);
          uni.hideLoading();
          submitted.value = true;
        } catch (err) {
          uni.hideLoading();
          uni.showToast({ title: '提交失败，请重试', icon: 'none' });
        }
      }
    }
  });
}

function showAgreement() {
  uni.showToast({ title: '商家入驻协议详情', icon: 'none' });
  // In production: uni.navigateTo({ url: '/pages/merchant/agreement' });
}

function goHome() {
  uni.redirectTo({ url: '/pages/merchant/manage' });
}

function goBack() {
  uni.switchTab({ url: '/pages/mine/index' });
}
</script>

<style lang="scss" scoped>
.apply-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

// ===== Step Indicator =====
.step-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 32rpx 48rpx;
  background-color: #FFFFFF;
  position: relative;
}

.step-connector {
  position: absolute;
  top: 52rpx;
  height: 2rpx;
  background-color: #E0E0E0;
  &.active { background-color: #FF6B35; }
  &:not(.last) {
    left: calc(25% + 24rpx);
    right: calc(75% - 24rpx);
  }
  &.last {
    left: calc(58%);
    right: calc(42% - 48rpx);
    &.active { background-color: #FF6B35; }
  }
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10rpx;
  z-index: 1;
}

.step-circle {
  width: 52rpx;
  height: 52rpx;
  border-radius: 50%;
  border: 2rpx solid #E0E0E0;
  background-color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  text {
    font-size: 24rpx;
    font-weight: 600;
    color: #bbb;
  }
}

.step-item.active .step-circle {
  background-color: #FF6B35;
  border-color: #FF6B35;
  text { color: #FFFFFF; }
}

.step-item.current .step-circle {
  border-color: #FF6B35;
  background-color: #FFFFFF;
  text { color: #FF6B35; }
}

.step-label {
  font-size: 22rpx;
  color: #bbb;
}

.step-item.active .step-label {
  color: #FF6B35;
  font-weight: 500;
}

// ===== Success Page =====
.success-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}

.success-icon-wrap {
  width: 140rpx;
  height: 140rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #07C160, #05A84E);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
  box-shadow: 0 8rpx 30rpx rgba(7, 193, 96, 0.3);
  .success-icon {
    font-size: 72rpx;
    color: #FFFFFF;
    font-weight: 700;
  }
}

.success-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #1A1A1A;
  margin-bottom: 16rpx;
}

.success-desc {
  font-size: 26rpx;
  color: #999;
  text-align: center;
  line-height: 1.6;
  max-width: 500rpx;
  margin-bottom: 48rpx;
}

.success-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
}

.success-btn {
  width: 400rpx;
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #E55D2B);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6rpx 20rpx rgba(229, 93, 43, 0.35);
  text { font-size: 30rpx; color: #FFFFFF; font-weight: 600; }
  &:active { opacity: 0.85; }
}

.cancel-btn {
  font-size: 26rpx;
  color: #999;
}

// ===== Stepper Scroll =====
.step-scroll {
  flex: 1;
}

// ===== Card =====
.card {
  margin: 20rpx 24rpx;
  background-color: #FFFFFF;
  border-radius: 20rpx;
  padding: 28rpx 24rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 32rpx;
  font-weight: 700;
  color: #1A1A1A;
  display: block;
  margin-bottom: 8rpx;
}

.section-hint {
  font-size: 24rpx;
  color: #bbb;
  display: block;
  margin-bottom: 20rpx;
}

//  Form Item
.form-item {
  margin-top: 24rpx;
}

.form-label {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 12rpx;
}

.required {
  color: #E74C3C;
}

.form-input {
  width: 100%;
  height: 80rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
}

.form-picker {
  width: 100%;
  height: 80rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  display: flex;
  align-items: center;
  justify-content: space-between;
  &.placeholder { color: #ccc; }
  .picker-arrow { font-size: 28rpx; color: #999; }
}

.hours-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.hours-picker {
  flex: 1;
  height: 80rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
  padding: 0 20rpx;
  font-size: 28rpx;
  color: #333;
  display: flex;
  align-items: center;
  &.placeholder { color: #ccc; }
}

.hours-sep {
  font-size: 28rpx;
  color: #999;
}

.form-textarea {
  width: 100%;
  min-height: 160rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  font-size: 28rpx;
  color: #333;
  line-height: 1.6;
}

.char-count {
  text-align: right;
  font-size: 22rpx;
  color: #bbb;
  margin-top: 8rpx;
  display: block;
}

// Checkbox Group
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
  padding: 12rpx 20rpx;
  background-color: #F9F9F9;
  border-radius: 12rpx;
  border: 2rpx solid transparent;
  &.checked {
    background-color: rgba(255, 107, 53, 0.06);
    border-color: #FF6B35;
  }
}

.checkbox-box {
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid #ddd;
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  .checked & {
    background-color: #FF6B35;
    border-color: #FF6B35;
    text { font-size: 22rpx; color: #FFFFFF; }
  }
}

.checkbox-label {
  font-size: 26rpx;
  color: #333;
}

// ===== Upload =====
.upload-item {
  margin-top: 24rpx;
}

.upload-label {
  font-size: 26rpx;
  color: #333;
  font-weight: 500;
  display: block;
  margin-bottom: 12rpx;
}

.upload-area {
  width: 100%;
  height: 220rpx;
  background-color: #F9F9F9;
  border: 2rpx dashed #ddd;
  border-radius: 16rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  position: relative;
  overflow: hidden;
  &.multi { height: 200rpx; }
}

.upload-icon {
  font-size: 52rpx;
}

.upload-hint {
  font-size: 26rpx;
  color: #bbb;
}

.upload-preview {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.upload-delete {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  text { font-size: 24rpx; color: #FFFFFF; }
}

.upload-extra {
  font-size: 22rpx;
  color: #bbb;
  margin-top: 8rpx;
  display: block;
}

// ===== Step Footer =====
.step-footer {
  padding: 24rpx;
  display: flex;
  gap: 16rpx;
  &.two-btns {
    .prev-btn, .next-btn { flex: 1; }
  }
}

.next-btn {
  flex: 1;
  height: 88rpx;
  background: linear-gradient(135deg, #FF6B35, #E55D2B);
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text {
    font-size: 30rpx;
    color: #FFFFFF;
    font-weight: 600;
  }
  &.disabled {
    opacity: 0.5;
  }
  &:active:not(.disabled) { opacity: 0.85; }
}

.prev-btn {
  flex: 1;
  height: 88rpx;
  background-color: #F5F5F5;
  border: 1rpx solid #E0E0E0;
  border-radius: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  text {
    font-size: 30rpx;
    color: #666;
    font-weight: 600;
  }
  &:active { background-color: #EEEEEE; }
}

// ===== Review =====
.review-section {
  .section-title { margin-bottom: 20rpx; }
}

.review-block {
  margin-bottom: 28rpx;
  &:last-child { margin-bottom: 0; }
}

.review-block-title {
  font-size: 26rpx;
  font-weight: 600;
  color: #FF6B35;
  display: block;
  margin-bottom: 14rpx;
  padding-bottom: 10rpx;
  border-bottom: 1rpx solid rgba(255, 107, 53, 0.15);
}

.review-row {
  display: flex;
  padding: 10rpx 0;
  .review-label {
    font-size: 26rpx;
    color: #999;
    width: 160rpx;
    flex-shrink: 0;
  }
  .review-value {
    font-size: 26rpx;
    color: #333;
    flex: 1;
    min-width: 0;
    &.status {
      &.status { color: #07C160; }
    }
  }
}

// ===== Agreement =====
.agreement-section {
  padding: 0 24rpx 8rpx;
}

.agreement-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 16rpx 0;
}

.agreement-checkbox {
  width: 36rpx;
  height: 36rpx;
  border: 2rpx solid #ddd;
  border-radius: 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  &.checked {
    background-color: #FF6B35;
    border-color: #FF6B35;
    text { color: #FFFFFF; font-size: 22rpx; }
  }
}

.agreement-text {
  font-size: 24rpx;
  color: #666;
}

.agreement-link {
  color: #FF6B35;
}

// ===== Bottom =====
.bottom-placeholder {
  height: 40rpx;
}
</style>
