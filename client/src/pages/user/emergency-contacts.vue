<template>
  <view class="emergency-page">
    <scroll-view class="page-scroll" scroll-y :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <!-- 顶部说明 -->
      <view class="intro-card">
        <text class="intro-icon">🆘</text>
        <view class="intro-text-wrap">
          <text class="intro-title">紧急联系人</text>
          <text class="intro-desc">SOS 求助时，将第一时间向你的紧急联系人发送位置与求助信息</text>
        </view>
      </view>

      <!-- 联系人列表 -->
      <view v-if="loading" class="loading-state">
        <text>加载中...</text>
      </view>

      <view v-else-if="contacts.length === 0" class="empty-state">
        <text class="empty-icon">🆘</text>
        <text class="empty-text">还没有紧急联系人</text>
        <text class="empty-hint">添加家人或朋友，关键时刻多一份保障</text>
      </view>

      <view v-else class="contact-list">
        <view v-for="contact in contacts" :key="contact.id" class="contact-card">
          <view class="contact-avatar">
            <text>{{ contact.name ? contact.name.charAt(0) : '?' }}</text>
            <view v-if="contact.is_primary === 1" class="primary-tag">
              <text>默认</text>
            </view>
          </view>
          <view class="contact-info">
            <view class="contact-name-row">
              <text class="contact-name">{{ contact.name }}</text>
              <text class="contact-relation">{{ relationLabel(contact.relationship) }}</text>
            </view>
            <text class="contact-phone">{{ maskPhone(contact.phone) }}</text>
          </view>
          <view class="contact-actions">
            <view
              v-if="contact.is_primary !== 1"
              class="contact-btn set-primary"
              @click="setPrimary(contact)"
            >
              <text>设为默认</text>
            </view>
            <view class="contact-btn delete" @click="deleteContact(contact)">
              <text>删除</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 底部占位 -->
      <view class="bottom-placeholder safe-area-bottom"></view>
    </scroll-view>

    <!-- 添加按钮 -->
    <view class="add-bar safe-area-bottom">
      <view class="add-btn" @click="showAddForm">
        <text class="add-btn-icon">＋</text>
        <text class="add-btn-text">添加紧急联系人</text>
      </view>
    </view>

    <!-- 添加/编辑表单 -->
    <view v-if="showForm" class="form-mask" @click="closeForm">
      <view class="form-card" @click.stop>
        <view class="form-header">
          <text class="form-title">{{ editingContact ? '编辑联系人' : '添加紧急联系人' }}</text>
          <text class="form-close" @click="closeForm">✕</text>
        </view>

        <view class="form-item">
          <text class="form-label">姓名</text>
          <input v-model="form.name" class="form-input" placeholder="联系人姓名" maxlength="20" />
        </view>

        <view class="form-item">
          <text class="form-label">手机号</text>
          <input v-model="form.phone" class="form-input" type="number" placeholder="11位手机号" maxlength="11" />
        </view>

        <view class="form-item">
          <text class="form-label">关系</text>
          <view class="relation-tags">
            <view
              v-for="rel in relations"
              :key="rel"
              class="relation-tag"
              :class="{ active: form.relationship === rel }"
              @click="form.relationship = rel"
            >
              <text>{{ rel }}</text>
            </view>
          </view>
        </view>

        <view class="form-item switch-row">
          <text class="form-label">设为默认联系人</text>
          <switch :checked="form.is_primary" color="#E74C3C" @change="form.is_primary = $event.detail.value" />
        </view>

        <view class="form-actions">
          <view class="form-btn cancel" @click="closeForm">
            <text>取消</text>
          </view>
          <view class="form-btn confirm" :class="{ disabled: saving }" @click="saveContact">
            <text>{{ saving ? '保存中...' : '保存' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { securityApi } from '@/utils/api.js';

export default {
  data() {
    return {
      contacts: [],
      loading: true,
      refreshing: false,
      saving: false,
      showForm: false,
      editingContact: null,
      relations: ['家人', '朋友', '同事', '伴侣', '其他'],
      form: {
        name: '',
        phone: '',
        relationship: '家人',
        is_primary: false
      }
    };
  },

  onLoad() {
    this.fetchContacts();
  },

  methods: {
    async fetchContacts() {
      try {
        const res = await securityApi.getContacts();
        this.contacts = (res && res.list) || [];
      } catch (err) {
        console.warn('加载紧急联系人失败:', err);
        this.contacts = [];
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    async onRefresh() {
      this.refreshing = true;
      await this.fetchContacts();
    },

    relationLabel(rel) {
      return rel || '其他';
    },

    maskPhone(phone) {
      if (!phone) return '--';
      return String(phone).replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
    },

    showAddForm() {
      this.editingContact = null;
      this.form = {
        name: '',
        phone: '',
        relationship: '家人',
        is_primary: this.contacts.length === 0
      };
      this.showForm = true;
    },

    closeForm() {
      if (this.saving) return;
      this.showForm = false;
    },

    async saveContact() {
      const name = (this.form.name || '').trim();
      const phone = (this.form.phone || '').trim();
      if (!name) {
        uni.showToast({ title: '请输入联系人姓名', icon: 'none' });
        return;
      }
      if (!/^1[3-9]\d{9}$/.test(phone)) {
        uni.showToast({ title: '请输入正确的手机号', icon: 'none' });
        return;
      }

      this.saving = true;
      try {
        await securityApi.addContact({
          name,
          phone,
          relationship: this.form.relationship,
          is_primary: !!this.form.is_primary
        });
        uni.showToast({ title: '已保存', icon: 'success' });
        this.showForm = false;
        await this.fetchContacts();
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
      } finally {
        this.saving = false;
      }
    },

    async setPrimary(contact) {
      try {
        // 后端以 is_primary=1 的保存自动取消其他默认;这里通过更新原记录实现
        await securityApi.addContact({
          name: contact.name,
          phone: contact.phone,
          relationship: contact.relationship,
          is_primary: true
        });
        uni.showToast({ title: '已设为默认', icon: 'success' });
        await this.fetchContacts();
      } catch (err) {
        uni.showToast({ title: '操作失败', icon: 'none' });
      }
    },

    deleteContact(contact) {
      uni.showModal({
        title: '删除联系人',
        content: `确定删除 ${contact.name || '该联系人'} 吗？`,
        confirmColor: '#E74C3C',
        success: async (res) => {
          if (!res.confirm) return;
          try {
            await securityApi.deleteContact(contact.id);
            uni.showToast({ title: '已删除', icon: 'success' });
            await this.fetchContacts();
          } catch (err) {
            uni.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      });
    }
  }
};
</script>

<style lang="scss" scoped>
.emergency-page {
  height: 100vh;
  background-color: #F5F5F5;
  display: flex;
  flex-direction: column;
}

.page-scroll {
  flex: 1;
}

.intro-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin: 24rpx;
  padding: 28rpx;
  background: linear-gradient(135deg, #FFF0ED, #FFE8E4);
  border-radius: 24rpx;
  border: 1rpx solid rgba(231, 76, 60, 0.18);

  .intro-icon {
    font-size: 56rpx;
    flex-shrink: 0;
  }

  .intro-text-wrap {
    flex: 1;

    .intro-title {
      font-size: 30rpx;
      font-weight: 700;
      color: #C0392B;
      display: block;
    }

    .intro-desc {
      font-size: 24rpx;
      color: #8C5A52;
      margin-top: 6rpx;
      line-height: 1.5;
      display: block;
    }
  }
}

.loading-state {
  display: flex;
  justify-content: center;
  padding: 120rpx 0;
  color: #999;
  font-size: 28rpx;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 140rpx 48rpx;
  gap: 16rpx;

  .empty-icon {
    font-size: 100rpx;
    opacity: 0.5;
  }

  .empty-text {
    font-size: 30rpx;
    font-weight: 600;
    color: #666;
  }

  .empty-hint {
    font-size: 24rpx;
    color: #999;
  }
}

.contact-list {
  padding: 0 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.contact-card {
  display: flex;
  align-items: center;
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 24rpx;
  gap: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .contact-avatar {
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, #E74C3C, #C0392B);
    color: #FFFFFF;
    font-size: 36rpx;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;

    .primary-tag {
      position: absolute;
      bottom: -8rpx;
      left: 50%;
      transform: translateX(-50%);
      background: #FFB300;
      color: #FFFFFF;
      font-size: 16rpx;
      padding: 2rpx 10rpx;
      border-radius: 10rpx;
      white-space: nowrap;
    }
  }

  .contact-info {
    flex: 1;
    min-width: 0;

    .contact-name-row {
      display: flex;
      align-items: center;
      gap: 12rpx;

      .contact-name {
        font-size: 30rpx;
        font-weight: 600;
        color: #1A1A1A;
      }

      .contact-relation {
        font-size: 20rpx;
        color: #E74C3C;
        background: #FDECEA;
        padding: 2rpx 12rpx;
        border-radius: 12rpx;
      }
    }

    .contact-phone {
      font-size: 26rpx;
      color: #666;
      margin-top: 8rpx;
      display: block;
    }
  }

  .contact-actions {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    flex-shrink: 0;

    .contact-btn {
      padding: 10rpx 20rpx;
      border-radius: 14rpx;
      font-size: 22rpx;
      text-align: center;

      &.set-primary {
        background: #FFF8E1;
        color: #FF8F00;
      }

      &.delete {
        background: #FDECEA;
        color: #E74C3C;
      }
    }
  }
}

.bottom-placeholder {
  height: 160rpx;
}

.add-bar {
  padding: 16rpx 24rpx;
  background: #FFFFFF;
  box-shadow: 0 -2rpx 16rpx rgba(0, 0, 0, 0.05);

  .add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10rpx;
    height: 88rpx;
    background: linear-gradient(135deg, #E74C3C, #C0392B);
    border-radius: 44rpx;
    color: #FFFFFF;

    .add-btn-icon {
      font-size: 36rpx;
    }

    .add-btn-text {
      font-size: 30rpx;
      font-weight: 600;
    }

    &:active {
      opacity: 0.85;
    }
  }
}

.form-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.form-card {
  width: 620rpx;
  background: #FFFFFF;
  border-radius: 28rpx;
  padding: 36rpx 32rpx 28rpx;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.2);

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 28rpx;

    .form-title {
      font-size: 34rpx;
      font-weight: 700;
      color: #1A1A1A;
    }

    .form-close {
      font-size: 28rpx;
      color: #999;
      padding: 8rpx;
    }
  }

  .form-item {
    margin-bottom: 24rpx;

    .form-label {
      font-size: 26rpx;
      color: #666;
      display: block;
      margin-bottom: 12rpx;
    }

    .form-input {
      height: 80rpx;
      padding: 0 24rpx;
      background: #F5F5F5;
      border-radius: 16rpx;
      font-size: 28rpx;
    }

    &.switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .form-label {
        margin-bottom: 0;
      }
    }
  }

  .relation-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;

    .relation-tag {
      padding: 10rpx 24rpx;
      border-radius: 16rpx;
      background: #F5F5F5;
      color: #666;
      font-size: 24rpx;

      &.active {
        background: #FDECEA;
        color: #E74C3C;
        border: 1rpx solid #E74C3C;
      }
    }
  }

  .form-actions {
    display: flex;
    gap: 20rpx;
    margin-top: 32rpx;

    .form-btn {
      flex: 1;
      height: 84rpx;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20rpx;
      font-size: 30rpx;
      font-weight: 600;

      &.cancel {
        background: #F5F5F5;
        color: #666;
      }

      &.confirm {
        background: linear-gradient(135deg, #E74C3C, #C0392B);
        color: #FFFFFF;

        &.disabled {
          opacity: 0.6;
        }
      }
    }
  }
}
</style>
