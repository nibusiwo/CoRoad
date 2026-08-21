/**
 * 行程状态管理 - Pinia Store
 * CoRoad 同道自驾社交平台
 */

import { defineStore } from 'pinia';
import api from '@/utils/api.js';
import { resolveAssetUrl } from '@/utils/api.js';
import { useUserStore } from './user.js';

function pickDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function getPointName(point) {
  if (!point) return '';
  if (typeof point === 'string') return point;
  return point.name || point.address || '';
}

function getPointCoord(point, key) {
  if (!point || typeof point !== 'object') return null;
  return pickDefined(point[key], point[key === 'lng' ? 'longitude' : 'latitude']);
}

function normalizeTripMember(member) {
  if (!member) return null;
  const role = pickDefined(member.role, member.role_code);
  const status = pickDefined(member.status, member.status_code);
  return {
    ...member,
    id: pickDefined(member.id, member.member_id),
    memberId: pickDefined(member.memberId, member.member_id),
    userId: pickDefined(member.userId, member.user_id),
    avatar: resolveAssetUrl(member.avatar || ''),
    vehicleModel: pickDefined(member.vehicleModel, member.vehicle_model),
    plateNumber: pickDefined(member.plateNumber, member.plate_number),
    isCertified: pickDefined(member.isCertified, member.is_certified),
    role,
    roleCode: role,
    status,
    statusCode: status,
    joinedAt: pickDefined(member.joinedAt, member.joined_at),
    joinTime: pickDefined(member.joinTime, member.joined_at),
    leftAt: pickDefined(member.leftAt, member.left_at),
    lastPosition: pickDefined(member.lastPosition, member.last_position)
  };
}

/**
 * 归一化标签/特色数组(后端可能返回 JSON 字符串或逗号分隔字符串)
 */
function normalizeStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* 不是 JSON */ }
    return trimmed.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export const useTripStore = defineStore('trip', {
  state: () => ({
    currentTrip: null,
    draftTrips: [],
    nearbyTrips: [],
    tripList: [],
    currentTripMembers: [],
    loading: false,
    nearbyLoading: false
  }),

  getters: {
    /** 当前是否有进行中的行程 */
    hasActiveTrip(state) {
      return !!(state.currentTrip && state.currentTrip.status === 2);
    },

    /** 当前行程是否为队长 */
    isCaptain(state) {
      if (!state.currentTrip) return false;
      const userStore = useUserStore();
      return state.currentTrip.captainId === userStore.userId;
    },

    /** 草稿数量 */
    draftCount(state) {
      return state.draftTrips.length;
    },

    /** 附近行程数量 */
    nearbyCount(state) {
      return state.nearbyTrips.length;
    }
  },

  actions: {
    /**
     * 获取当前用户所在的行程
     */
    async fetchCurrentTrip() {
      this.loading = true;
      try {
        // skipAuthRedirect: 静默处理 401,避免与 fetchDrafts 等并行请求同时触发 reLaunch
        // 登录态过期时由 App.vue 的 restoreLoginState 统一兜底跳转
        // mine=1: 只返回我是成员的行程,避免把"进行中但已离开/未加入"的公开行程误判为我的行程,
        // 否则 map 页会据此调用 /locations/team 而收到 400(后端要求我必须是活跃成员 status=2)
        const res = await api.trip.getTripList({ status: 2, size: 1, mine: 1 }, { skipAuthRedirect: true });
        const list = this.normalizeTripList(res);
        // 仅保留我仍是活跃成员(myStatus=2)的行程,排除待审批(1)/已离开(3/4)等情况
        this.currentTrip = list.find((t) => t.myStatus === 2) || null;
        return this.currentTrip;
      } catch (err) {
        throw err;
      } finally {
        this.loading = false;
      }
    },

    /**
     * 获取附近行程
     * @param {number} lng 经度
     * @param {number} lat 纬度
     */
    async fetchNearbyTrips(lng, lat) {
      this.nearbyLoading = true;
      try {
        const res = await api.trip.getNearbyTrips(lng, lat);
        this.nearbyTrips = this.normalizeTripList(res);
        return this.nearbyTrips;
      } catch (err) {
        throw err;
      } finally {
        this.nearbyLoading = false;
      }
    },

    /**
     * 获取行程列表
     * @param {Object} params
     */
    async fetchTripList(params) {
      this.loading = true;
      try {
        const res = await api.trip.getTripList(params);
        const list = this.normalizeTripList(res);
        this.tripList = list;
        if (res && !Array.isArray(res)) {
          return {
            ...res,
            records: list,
            list
          };
        }
        return list;
      } catch (err) {
        throw err;
      } finally {
        this.loading = false;
      }
    },

    /**
     * 获取行程详情
     * @param {string} id
     */
    async fetchTripDetail(id) {
      this.loading = true;
      try {
        const detail = await api.trip.getTripDetail(id);
        const mapped = this.mapTripFields(detail);
        // 如果是当前行程，更新 currentTrip
        if (this.currentTrip && this.currentTrip.id === id) {
          this.currentTrip = mapped;
        }
        return mapped;
      } catch (err) {
        throw err;
      } finally {
        this.loading = false;
      }
    },

    /**
     * 将后端 snake_case 字段映射为前端 camelCase
     */
    normalizeTripList(res) {
      const list = Array.isArray(res) ? res : (res && (res.records || res.list)) || [];
      return Array.isArray(list) ? list.map((trip) => this.mapTripFields(trip)) : [];
    },

    mapTripFields(trip) {
      if (!trip) return null;
      const startPointRaw = pickDefined(trip.start_point, trip.startPointData, trip.startPoint);
      const endPointRaw = pickDefined(trip.end_point, trip.endPointData, trip.endPoint);
      const leaderInfo = trip.leader_info || trip.leaderInfo || {};
      const leaderId = pickDefined(trip.leader_id, trip.leaderId, leaderInfo.id, trip.captainId);
      const leaderNickname = pickDefined(trip.leader_nickname, trip.leaderNickname, leaderInfo.nickname, trip.captainNickname);
const leaderAvatar = resolveAssetUrl(pickDefined(trip.leader_avatar, trip.leaderAvatar, leaderInfo.avatar, trip.captainAvatar) || '');
      const leaderLevel = pickDefined(trip.leader_level, trip.leaderLevel, leaderInfo.level, trip.captainLevel);
      const leaderCertified = pickDefined(trip.leader_certified, trip.leaderCertified, leaderInfo.is_certified, trip.captainCertified);
      const leaderRating = pickDefined(trip.leader_rating, trip.leaderRating, leaderInfo.rating, trip.captainRating);
      const currentCars = pickDefined(trip.current_cars, trip.currentCars, trip.joinedCars);
      const currentMembers = pickDefined(trip.current_members, trip.currentMembers, trip.memberCount);
      const myStatus = pickDefined(trip.my_status, trip.myStatus);
      const hasApplied = pickDefined(trip.has_applied, trip.hasApplied, myStatus === 1);
      const isMember = pickDefined(trip.is_member, trip.isMember, myStatus === 2);
      const isCaptain = pickDefined(trip.is_captain, trip.isCaptain);
      const joinLocked = !!(hasApplied || isMember || isCaptain);

      return {
        ...trip,
        startPoint: getPointName(startPointRaw),
        startPointData: startPointRaw,
        startLng: pickDefined(trip.start_lng, trip.startLng, getPointCoord(startPointRaw, 'lng')),
        startLat: pickDefined(trip.start_lat, trip.startLat, getPointCoord(startPointRaw, 'lat')),
        endPoint: getPointName(endPointRaw),
        endPointData: endPointRaw,
        endLng: pickDefined(trip.end_lng, trip.endLng, getPointCoord(endPointRaw, 'lng')),
        endLat: pickDefined(trip.end_lat, trip.endLat, getPointCoord(endPointRaw, 'lat')),
        departureTime: trip.departure_time || trip.departureTime,
        estimatedDays: trip.estimated_days !== undefined ? trip.estimated_days : trip.estimatedDays,
        dailyDistance: trip.daily_distance !== undefined ? trip.daily_distance : trip.dailyDistance,
        maxCars: trip.max_cars !== undefined ? trip.max_cars : trip.maxCars,
        currentCars,
        joinedCars: pickDefined(trip.joinedCars, currentCars),
        maxMembers: trip.max_members !== undefined ? trip.max_members : trip.maxMembers,
        currentMembers,
        memberCount: pickDefined(trip.memberCount, currentMembers),
        isPublic: trip.is_public !== undefined ? trip.is_public : trip.isPublic,
        leaderInfo: {
          ...leaderInfo,
          id: leaderId,
          nickname: leaderNickname,
          avatar: leaderAvatar,
          level: leaderLevel,
          is_certified: leaderCertified
        },
        leaderId,
        leaderNickname,
        leaderAvatar,
        leaderVehicle: pickDefined(trip.leader_vehicle, trip.leaderVehicle, leaderInfo.vehicle_model),
        leaderPlate: pickDefined(trip.leader_plate, trip.leaderPlate, leaderInfo.plate_number),
        leaderLevel,
        leaderGrowth: pickDefined(trip.leader_growth, trip.leaderGrowth, leaderInfo.growth_value),
        leaderCertified,
        leaderRating,
        captainId: pickDefined(trip.captainId, trip.captain_id, leaderId),
        captainNickname: pickDefined(trip.captainNickname, trip.captain_nickname, leaderNickname),
        captainAvatar: pickDefined(trip.captainAvatar, trip.captain_avatar, leaderAvatar),
        captainLevel: pickDefined(trip.captainLevel, trip.captain_level, leaderLevel),
        captainCertified: pickDefined(trip.captainCertified, trip.captain_certified, leaderCertified),
        captainRating: pickDefined(trip.captainRating, trip.captain_rating, leaderRating),
        routeMatch: pickDefined(trip.route_match, trip.routeMatch),
        distanceKm: pickDefined(trip.distance_km, trip.distanceKm),
        tags: normalizeStringArray(trip.tags),
        features: normalizeStringArray(trip.features),
        myRole: pickDefined(trip.my_role, trip.myRole),
        myStatus,
        hasApplied: joinLocked,
        isMember,
        isCaptain,
        pendingApplicants: trip.pending_applicants || trip.pendingApplicants,
        members: Array.isArray(trip.members) ? trip.members.map(normalizeTripMember) : trip.members,
        startedAt: trip.started_at || trip.startedAt,
        finishedAt: trip.finished_at || trip.finishedAt,
        createdAt: trip.created_at || trip.createdAt,
        updatedAt: trip.updated_at || trip.updatedAt
      };
    },

    /**
     * 获取行程成员
     * @param {string} id
     */
    async fetchTripMembers(id) {
      try {
        const members = await api.trip.getTripMembers(id);
        this.currentTripMembers = Array.isArray(members) ? members.map(normalizeTripMember) : [];
        return this.currentTripMembers;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 创建行程
     * @param {Object} data
     */
    async createTrip(data) {
      try {
        const result = await api.trip.createTrip(data);
        this.currentTrip = result;
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 更新行程
     * @param {string} id
     * @param {Object} data
     */
    async updateTrip(id, data) {
      try {
        const result = await api.trip.updateTrip(id, data);
        if (this.currentTrip && this.currentTrip.id === id) {
          this.currentTrip = { ...this.currentTrip, ...result };
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 开始行程
     * @param {string} id
     */
    async startTrip(id) {
      try {
        const result = await api.trip.startTrip(id);
        if (this.currentTrip && this.currentTrip.id === id) {
          this.currentTrip.status = 2;
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 结束行程
     * @param {string} id
     */
    async finishTrip(id) {
      try {
        const result = await api.trip.finishTrip(id);
        if (this.currentTrip && this.currentTrip.id === id) {
          this.currentTrip.status = 3;
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 取消行程
     * @param {string} id
     */
    async cancelTrip(id) {
      try {
        const result = await api.trip.cancelTrip(id);
        if (this.currentTrip && this.currentTrip.id === id) {
          this.currentTrip = null;
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 申请加入行程
     * @param {string} id
     */
    async applyJoin(id) {
      try {
        const result = await api.trip.applyJoin(id);
        const markApplied = (trip) => {
          if (!trip || String(trip.id) !== String(id)) return trip;
          return {
            ...trip,
            myStatus: pickDefined(result && result.my_status, result && result.myStatus, 1),
            hasApplied: pickDefined(result && result.has_applied, result && result.hasApplied, true),
            isMember: pickDefined(result && result.is_member, result && result.isMember, false)
          };
        };
        this.nearbyTrips = this.nearbyTrips.map(markApplied);
        this.tripList = this.tripList.map(markApplied);
        if (this.currentTrip && String(this.currentTrip.id) === String(id)) {
          this.currentTrip = markApplied(this.currentTrip);
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 同意成员加入
     * @param {string} tripId
     * @param {string} userId
     */
    async approveMember(tripId, userId) {
      try {
        return await api.trip.approveMember(tripId, userId);
      } catch (err) {
        throw err;
      }
    },

    /**
     * 拒绝成员加入
     * @param {string} tripId
     * @param {string} userId
     */
    async rejectMember(tripId, userId) {
      try {
        return await api.trip.rejectMember(tripId, userId);
      } catch (err) {
        throw err;
      }
    },

    /**
     * 移除成员
     * @param {string} tripId
     * @param {string} userId
     */
    async removeMember(tripId, userId) {
      try {
        return await api.trip.removeMember(tripId, userId);
      } catch (err) {
        throw err;
      }
    },

    /**
     * 退出行程
     * @param {string} id
     */
    async leaveTrip(id) {
      try {
        const result = await api.trip.leaveTrip(id);
        if (this.currentTrip && this.currentTrip.id === id) {
          this.currentTrip = null;
        }
        return result;
      } catch (err) {
        throw err;
      }
    },

    // ---- 草稿管理 ----

    /**
     * 获取草稿列表
     */
    async fetchDrafts() {
      try {
        // skipAuthRedirect: 静默处理 401,避免与 fetchCurrentTrip 等并行请求同时触发 reLaunch
        const res = await api.trip.getDrafts({ skipAuthRedirect: true });
        const list = res.records || res || [];
        this.draftTrips = (Array.isArray(list) ? list : []).map((d) => this.mapTripFields(d) || d);
        return this.draftTrips;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 创建草稿
     * @param {Object} data
     */
    async createDraft(data) {
      try {
        const draft = await api.trip.createDraft(data);
        this.draftTrips.unshift(draft);
        return draft;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 更新草稿
     * @param {string} id
     * @param {Object} data
     */
    async updateDraft(id, data) {
      try {
        const draft = await api.trip.updateDraft(id, data);
        const index = this.draftTrips.findIndex((d) => d.id === id);
        if (index !== -1) {
          this.draftTrips[index] = { ...this.draftTrips[index], ...draft };
        }
        return draft;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 删除草稿
     * @param {string} id
     */
    async deleteDraft(id) {
      try {
        await api.trip.deleteDraft(id);
        this.draftTrips = this.draftTrips.filter((d) => d.id !== id);
      } catch (err) {
        throw err;
      }
    },

    /**
     * 发布草稿
     * @param {string} id
     */
    async publishDraft(id) {
      try {
        const result = await api.trip.publishDraft(id);
        this.draftTrips = this.draftTrips.filter((d) => d.id !== id);
        this.currentTrip = result;
        return result;
      } catch (err) {
        throw err;
      }
    },

    /**
     * 清空当前行程
     */
    clearCurrentTrip() {
      this.currentTrip = null;
      this.currentTripMembers = [];
    },

    /**
     * 重置所有状态
     */
    resetAll() {
      this.currentTrip = null;
      this.draftTrips = [];
      this.nearbyTrips = [];
      this.tripList = [];
      this.currentTripMembers = [];
      this.loading = false;
      this.nearbyLoading = false;
    }
  }
});
