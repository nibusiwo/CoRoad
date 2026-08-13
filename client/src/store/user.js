/**
 * 用户状态管理 - Pinia Store
 * CoRoad 同道自驾社交平台
 */

import { defineStore } from 'pinia';
import api from '@/utils/api.js';
import { resolveAssetUrl } from '@/utils/api.js';

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    userInfo: null,
    profile: null,
    isLoggedIn: false
  }),

  getters: {
    /** 是否已认证车主 */
    isCertified(state) {
      return !!(state.profile && state.profile.certified);
    },

    /** 用户等级 */
    level(state) {
      if (!state.profile) return 1;
      // 后端已计算准确等级,直接使用,避免前端阈值表与后端不一致
      if (state.profile.level !== undefined && state.profile.level !== null) {
        return state.profile.level || 1;
      }
      const growth = state.profile.growth_value !== undefined
        ? state.profile.growth_value
        : (state.profile.growth || 0);
      if (growth < 100) return 1;
      if (growth < 500) return 2;
      if (growth < 2000) return 3;
      if (growth < 5000) return 4;
      if (growth < 10000) return 5;
      return 6;
    },

    /** 同路值(成长值) */
    growth(state) {
      if (!state.profile) return 0;
      return state.profile.growth_value !== undefined
        ? state.profile.growth_value
        : (state.profile.growth || 0);
    },

    /** 用户等级名称 */
    levelName(state) {
      if (state.profile && state.profile.level_name) {
        return state.profile.level_name;
      }
      const level = this.level;
      const names = {
        1: '初级车友',
        2: '活跃车友',
        3: '资深车友',
        4: '达人车友',
        5: '领行车友',
        6: '至尊车友'
      };
      return names[level] || '初级车友';
    },

    /** 用户ID */
    userId(state) {
      return (state.profile && state.profile.id) || '';
    },

    /** 头像 */
    avatar(state) {
      return resolveAssetUrl((state.profile && state.profile.avatar) || '/static/default-avatar.png');
    },

    /** 主页背景图 */
    coverImage(state) {
      const cover = (state.profile && (state.profile.cover_image || state.profile.coverImage)) || '';
      return resolveAssetUrl(cover);
    },

    /** 昵称 */
    nickname(state) {
      return (state.profile && state.profile.nickname) || '车友';
    }
  },

  actions: {
    /**
     * 微信登录
     * @param {string} code 微信 code
     * @param {Object} userInfo 用户信息
     */
    async login(code, userInfo) {
      try {
        const res = await api.auth.wechatLogin(code, userInfo);
        // 后端返回 { token, user } 格式
        this.token = res.token;
        this.userInfo = res.user || res.userInfo || null;
        this.profile = res.user || res.profile || null;
        this.isLoggedIn = true;
        uni.setStorageSync('token', this.token);
        uni.setStorageSync('userInfo', JSON.stringify(this.userInfo));
        return res;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 手机号登录
     * @param {string} phone 手机号
     * @param {string} code 验证码
     */
    async phoneLogin(phone, code) {
      try {
        const res = await api.auth.phoneLogin(phone, code);
        // 后端返回 { token, user } 格式
        this.token = res.token;
        this.userInfo = res.user || res.userInfo || null;
        this.profile = res.user || res.profile || null;
        this.isLoggedIn = true;
        uni.setStorageSync('token', this.token);
        uni.setStorageSync('userInfo', JSON.stringify(this.userInfo));
        return res;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 手机号+密码登录
     */
    async passwordLogin(phone, password) {
      try {
        const res = await api.auth.passwordLogin(phone, password);
        this.token = res.token;
        this.userInfo = res.user || res.userInfo || null;
        this.profile = res.user || res.profile || null;
        this.isLoggedIn = true;
        uni.setStorageSync('token', this.token);
        uni.setStorageSync('userInfo', JSON.stringify(this.userInfo));
        return res;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 手机号注册（验证码 + 密码），注册成功后自动登录
     */
    async register(phone, code, password, nickname) {
      try {
        const res = await api.auth.register(phone, code, password, nickname);
        this.token = res.token;
        this.userInfo = res.user || res.userInfo || null;
        this.profile = res.user || res.profile || null;
        this.isLoggedIn = true;
        uni.setStorageSync('token', this.token);
        uni.setStorageSync('userInfo', JSON.stringify(this.userInfo));
        return res;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 退出登录
     */
    logout() {
      this.token = '';
      this.userInfo = null;
      this.profile = null;
      this.isLoggedIn = false;
      try {
        uni.removeStorageSync('token');
        uni.removeStorageSync('userInfo');
      } catch (e) {
        // ignore
      }
    },

    /**
     * 拉取用户个人信息
     */
    async fetchProfile() {
      try {
        const profile = await api.user.getProfile();
        this.profile = profile;
        return profile;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 更新用户个人信息
     * @param {Object} data
     */
    async updateProfile(data) {
      try {
        const profile = await api.user.updateProfile(data);
        this.profile = { ...this.profile, ...profile };
        return profile;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 车主认证
     * @param {Object} data
     */
    async certifyVehicle(data) {
      try {
        const result = await api.user.certifyVehicle(data);
        if (this.profile) {
          this.profile.certified = true;
          this.profile.vehicle = data;
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 刷新 token
     */
    async refreshToken() {
      try {
        const res = await api.auth.refreshToken();
        this.token = res.token;
        uni.setStorageSync('token', this.token);
        return res;
      } catch (err) {
        this.logout();
        throw err;
      }
    }
  }
});
