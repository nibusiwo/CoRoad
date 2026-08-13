<template>
  <view class="support-page">
    <scroll-view class="page-scroll" scroll-y>
      <!-- 常用问题 -->
      <view class="section-card">
        <view class="section-title">常见问题</view>
        <view
          v-for="(faq, idx) in faqs"
          :key="idx"
          class="faq-item"
          @click="toggleFaq(idx)"
        >
          <view class="faq-question-row">
            <text class="faq-q">Q</text>
            <text class="faq-question">{{ faq.q }}</text>
            <text class="faq-arrow">{{ openFaq === idx ? '−' : '＋' }}</text>
          </view>
          <view v-if="openFaq === idx" class="faq-answer">
            <text>{{ faq.a }}</text>
          </view>
        </view>
      </view>

      <!-- 提交工单 -->
      <view class="section-card">
        <view class="section-title">联系客服 / 提交工单</view>
        <view class="form-item">
          <text class="form-label">问题类型</text>
          <view class="category-tags">
            <view
              v-for="cat in categories"
              :key="cat.value"
              class="category-tag"
              :class="{ active: form.category === cat.value }"
              @click="form.category = cat.value"
            >
              <text>{{ cat.label }}</text>
            </view>
          </view>
        </view>
        <view class="form-item">
          <text class="form-label">主题</text>
          <input v-model="form.subject" class="form-input" placeholder="一句话描述问题" maxlength="50" />
        </view>
        <view class="form-item">
          <text class="form-label">问题描述</text>
          <textarea
            v-model="form.content"
            class="form-textarea"
            placeholder="请详细描述遇到的问题，方便我们尽快处理"
            maxlength="500"
          />
        </view>
        <view class="submit-btn" :class="{ disabled: submitting }" @click="submitTicket">
          <text>{{ submitting ? '提交中...' : '提交工单' }}</text>
        </view>
      </view>

      <!-- 我的工单 -->
      <view class="section-card">
        <view class="section-title">我的工单</view>
        <view v-if="tickets.length === 0" class="empty-tickets">
          <text>暂无工单记录</text>
        </view>
        <view v-for="ticket in tickets" :key="ticket.id" class="ticket-item">
          <view class="ticket-header">
            <text class="ticket-subject">{{ ticket.subject }}</text>
            <view class="ticket-status" :class="'st-' + ticket.status">
              <text>{{ statusLabel(ticket.status) }}</text>
            </view>
          </view>
          <text class="ticket-content">{{ ticket.content }}</text>
          <text class="ticket-time">{{ formatTime(ticket.created_at) }}</text>
        </view>
      </view>

      <view class="bottom-placeholder"></view>
    </scroll-view>
  </view>
</template>

<script>
import api from '@/utils/api.js';

export default {
  data() {
    return {
      openFaq: 0,
      faqs: [
        { q: '如何申请车主认证？', a: '在「我的-信任与安全-车认证」中上传行驶证照片，运营人员将在1-2个工作日内完成审核。认证前只能浏览，认证后可发起和加入行程。' },
        { q: '拼团成功后如何核销？', a: '在「我的订单」中找到对应订单，出示核销码，商家扫码核销即可。核销后订单会进入结算流程。' },
        { q: '拼团失败了怎么办？', a: '拼团在有效期内未达到目标人数会自动失败，已支付订单将原路自动退款，请留意到账通知。' },
        { q: '如何联系紧急联系人？', a: '在「我的-信任与安全-紧急联系人」中添加联系人。触发 SOS 时，系统会向紧急联系人发送你的位置与求助信息。' }
      ],
      categories: [
        { value: 'order', label: '订单问题' },
        { value: 'pay', label: '支付退款' },
        { value: 'merchant', label: '商家相关' },
        { value: 'account', label: '账号安全' },
        { value: 'other', label: '其他' }
      ],
      form: {
        category: 'order',
        subject: '',
        content: ''
      },
      submitting: false,
      tickets: []
    };
  },

  onLoad() {
    this.fetchTickets();
  },

  methods: {
    toggleFaq(idx) {
      this.openFaq = this.openFaq === idx ? -1 : idx;
    },

    async fetchTickets() {
      try {
        const res = await api.get('/support/tickets');
        this.tickets = (res && res.list) || [];
      } catch (err) {
        console.warn('加载工单失败:', err);
        this.tickets = [];
      }
    },

    async submitTicket() {
      const subject = (this.form.subject || '').trim();
      const content = (this.form.content || '').trim();
      if (!subject) {
        uni.showToast({ title: '请填写主题', icon: 'none' });
        return;
      }
      if (!content) {
        uni.showToast({ title: '请填写问题描述', icon: 'none' });
        return;
      }
      this.submitting = true;
      try {
        await api.post('/support/tickets', {
          category: this.form.category,
          subject,
          content
        });
        uni.showToast({ title: '工单已提交', icon: 'success' });
        this.form.subject = '';
        this.form.content = '';
        await this.fetchTickets();
      } catch (err) {
        uni.showToast({ title: (err && err.message) || '提交失败', icon: 'none' });
      } finally {
        this.submitting = false;
      }
    },

    statusLabel(status) {
      const map = {
        0: '待处理',
        1: '处理中',
        2: '已解决',
        3: '已关闭'
      };
      return map[status] || '待处理';
    },

    formatTime(timeStr) {
      if (!timeStr) return '';
      const d = new Date(timeStr);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return m + '/' + day + ' ' + h + ':' + min;
    }
  }
};
</script>

<style lang="scss" scoped>
.support-page {
  min-height: 100vh;
  background: #F5F5F5;
}

.page-scroll {
  padding-bottom: 40rpx;
}

.section-card {
  margin: 24rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);

  .section-title {
    font-size: 30rpx;
    font-weight: 700;
    color: #1A1A1A;
    margin-bottom: 20rpx;
  }
}

.faq-item {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #F0F0F0;

  &:last-child {
    border-bottom: none;
  }

  .faq-question-row {
    display: flex;
    align-items: center;
    gap: 12rpx;

    .faq-q {
      width: 40rpx;
      height: 40rpx;
      border-radius: 50%;
      background: #E8F8EF;
      color: #07C160;
      font-size: 24rpx;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .faq-question {
      flex: 1;
      font-size: 28rpx;
      color: #1A1A1A;
    }

    .faq-arrow {
      font-size: 30rpx;
      color: #CCC;
    }
  }

  .faq-answer {
    margin: 12rpx 0 4rpx 52rpx;
    padding: 16rpx 20rpx;
    background: #F7F8FA;
    border-radius: 12rpx;
    font-size: 24rpx;
    color: #666;
    line-height: 1.6;
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

  .form-textarea {
    width: 100%;
    height: 180rpx;
    padding: 20rpx 24rpx;
    background: #F5F5F5;
    border-radius: 16rpx;
    font-size: 26rpx;
    box-sizing: border-box;
  }

  .category-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;

    .category-tag {
      padding: 10rpx 24rpx;
      border-radius: 16rpx;
      background: #F5F5F5;
      color: #666;
      font-size: 24rpx;

      &.active {
        background: #E8F8EF;
        color: #07C160;
        border: 1rpx solid #07C160;
      }
    }
  }
}

.submit-btn {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #07C160, #05A84E);
  color: #FFFFFF;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 20rpx;

  &.disabled {
    opacity: 0.6;
  }
}

.empty-tickets {
  text-align: center;
  padding: 40rpx 0;
  color: #999;
  font-size: 24rpx;
}

.ticket-item {
  padding: 18rpx 0;
  border-bottom: 1rpx solid #F0F0F0;

  &:last-child {
    border-bottom: none;
  }

  .ticket-header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .ticket-subject {
      font-size: 28rpx;
      font-weight: 600;
      color: #1A1A1A;
    }

    .ticket-status {
      font-size: 20rpx;
      padding: 4rpx 16rpx;
      border-radius: 12rpx;

      &.st-0 {
        color: #FF8F00;
        background: #FFF8E1;
      }

      &.st-1 {
        color: #4A90D9;
        background: #EDF4FC;
      }

      &.st-2 {
        color: #07C160;
        background: #E8F8EF;
      }
    }
  }

  .ticket-content {
    font-size: 24rpx;
    color: #666;
    margin-top: 8rpx;
    display: block;
    line-height: 1.5;
  }

  .ticket-time {
    font-size: 22rpx;
    color: #999;
    margin-top: 8rpx;
    display: block;
  }
}

.bottom-placeholder {
  height: 60rpx;
}
</style>
