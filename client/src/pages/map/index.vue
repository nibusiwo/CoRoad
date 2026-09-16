<template>
  <view class="map-page">
    <!-- ==================== Top Status Bar (Frosted Glass) ==================== -->
    <view class="status-bar" :style="{ paddingTop: statusBarHeight + 'px' }">
      <view class="status-bar-inner">
        <!-- Left: Team name + day counter -->
        <view class="status-left" v-if="tripStore.hasCurrentTrip">
          <text class="team-name">{{ tripStore.currentTrip.name || tripStore.currentTrip.title || '车队' }}</text>
          <text class="day-counter">Day{{ dayCounter }}</text>
        </view>
        <view class="status-left" v-else>
          <text class="team-name">同道</text>
        </view>

        <!-- Center: Remaining time -->
        <view class="status-center" v-if="tripStore.hasCurrentTrip">
          <text class="remaining-time">剩余{{ remainingDays }}天</text>
        </view>
        <view class="status-center" v-else>
          <text class="remaining-time">探索路上</text>
        </view>

        <!-- Right: indicators -->
        <view class="status-right">
          <!-- Unread message badge -->
          <view class="status-item" @tap="goToMessages">
            <text class="status-icon">{{ unreadCount > 0 ? '💬' : '' }}</text>
            <text class="status-value" v-if="unreadCount > 0">{{ unreadCount }}</text>
          </view>
          <!-- Altitude -->
          <view class="status-item" v-if="currentAltitude">
            <text class="status-icon">🏔️</text>
            <text class="status-value">{{ currentAltitude }}m</text>
          </view>
          <!-- Weather -->
          <view class="status-item" v-if="weather && weather.temp !== null && weather.temp !== undefined">
            <text class="status-icon">{{ weather.icon }}</text>
            <text class="status-value">{{ weather.temp }}°C</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== B6: 燃油/充电焦虑提醒条 ==================== -->
    <view class="fuel-anxiety-bar" v-if="fuelAnxiety && fuelAnxiety.shouldWarn" @tap="navigateToNearestFuel">
      <text class="fuel-bar-icon">{{ fuelAnxiety.type === 'charge' ? '🔌' : '⛽' }}</text>
      <text class="fuel-bar-text">距最近{{ fuelAnxiety.type === 'charge' ? '充电站' : '加油站' }} {{ fuelAnxiety.nearestDistance }}km</text>
      <text class="fuel-bar-arrow">›</text>
    </view>

    <!-- ==================== Main Map Area ==================== -->
    <map
      v-if="mapReady"
      id="coroadMap"
      class="map-view"
      ref="mapRef"
      :latitude="mapCenter.latitude"
      :longitude="mapCenter.longitude"
      :scale="mapScale"
      :show-scale="true"
      :enable-traffic="trafficEnabled"
      :markers="displayMarkers"
      :polyline="routePolyline"
      :include-points="includePoints"
      :enable-3D="true"
      :enable-overlooking="true"
      :enable-zoom="true"
      :enable-scroll="true"
      :enable-rotate="true"
      :show-location="true"
      @markertap="onMarkerTap"
      @callouttap="onCalloutTap"
      @regionchange="onRegionChange"
      @tap="onMapTap"
      @longpress="onMapLongPress"
      @error="onMapError"
    >
    </map>

    <!-- ==================== Map Placeholder (when map fails to load) ==================== -->
    <view class="map-placeholder" v-if="!mapReady">
      <view class="placeholder-content">
        <view class="placeholder-icon">🗺️</view>
        <text class="placeholder-title">地图加载中</text>
        <text class="placeholder-desc">正在初始化地图服务...</text>
        <view class="placeholder-actions">
          <view class="placeholder-btn" @tap="retryMap">
            <text>重新加载</text>
          </view>
          <view class="placeholder-btn secondary" @tap="goToTripCreate">
            <text>发起行程</text>
          </view>
        </view>
      </view>
    </view>

    <!-- H5 地图 SDK 加载失败提示(网络无法访问高德时不再静默灰屏) -->
    <view v-if="mapSdkError" class="map-sdk-error">
      <view class="sdk-error-card">
        <text class="sdk-error-icon">🗺️</text>
        <text class="sdk-error-title">地图加载失败</text>
        <text class="sdk-error-desc">无法连接地图服务，请检查网络后重试</text>
        <view class="sdk-error-btn" @tap="retryMapSdk">
          <text>重新加载</text>
        </view>
      </view>
    </view>

    <!-- ==================== Layer Toggle Button ==================== -->
    <view class="layer-toggle-btn" @tap="showLayerPanel = !showLayerPanel" v-if="mapReady">
      <text class="layer-icon">🗺️</text>
    </view>

    <!-- Layer Control Panel -->
    <view class="layer-panel" v-if="showLayerPanel" @tap.stop>
      <view class="layer-panel-header">
        <text class="layer-panel-title">地图图层</text>
        <text class="layer-panel-close" @tap="showLayerPanel = false">✕</text>
      </view>
      <view class="layer-list">
        <view class="layer-item" v-for="layer in layers" :key="layer.key">
          <view class="layer-label">
            <text class="layer-name">{{ layer.label }}</text>
            <text class="layer-desc">{{ layer.desc }}</text>
          </view>
          <switch
            :checked="layer.visible"
            :color="layer.color || '#07C160'"
            @change="toggleLayer(layer.key, $event)"
          />
        </view>
      </view>
    </view>

    <!-- ==================== Bottom Operation Area ==================== -->
    <view class="bottom-area">
      <!-- Current Trip Card -->
      <view class="trip-card" v-if="tripStore.hasCurrentTrip" @tap="goToTripDetail">
        <view class="trip-card-row">
          <view class="trip-card-left">
            <text class="trip-level">L{{ tripStore.currentTrip.level || 2 }}</text>
          <text class="trip-name">{{ tripStore.currentTrip.name || tripStore.currentTrip.title || '行程' }}</text>
            <text class="trip-distance" v-if="tripStore.currentTrip.distanceToDest !== null && tripStore.currentTrip.distanceToDest !== undefined">
              距{{ tripStore.currentTrip.destinationName || '终点' }}还有{{ tripStore.currentTrip.distanceToDest }}km
            </text>
            <text class="trip-distance" v-else-if="tripStore.currentTrip.routeDistanceKm !== null && tripStore.currentTrip.routeDistanceKm !== undefined">
              全程约{{ tripStore.currentTrip.routeDistanceKm }}km
            </text>
          </view>
          <view class="trip-card-actions">
            <view class="trip-action-btn" @tap.stop="toggleShareLocation">
              <text>共享位置</text>
              <text class="trip-action-status" :class="{ on: shareLocationOn }">
                {{ shareLocationOn ? 'ON' : 'OFF' }}
              </text>
            </view>
            <view class="trip-action-btn intercom" @tap.stop="openIntercom">
              <text>对讲</text>
            </view>
          </view>
        </view>
      </view>

      <!-- No trip card -->
      <view class="trip-card no-trip" v-else @tap="goToTripCreate">
        <view class="trip-card-row">
          <text class="no-trip-text">还没有行程？点此发起你的自驾之旅</text>
          <text class="no-trip-arrow">›</text>
        </view>
      </view>

      <!-- Bottom Action Buttons Row -->
      <view class="bottom-actions">
        <view class="action-btn primary" @tap="goToTripCreate">
          <image class="action-btn-icon" src="/static/action/trip-truck-userref.png" mode="aspectFit" />
          <text class="action-btn-text">设行程</text>
        </view>
        <view class="action-btn" @tap="reportMyLocation">
          <image class="action-btn-icon" src="/static/action/report-pin-userref.png" mode="aspectFit" />
          <text class="action-btn-text">报位置</text>
        </view>
        <view class="action-btn sos" @tap="onSosTap" @touchstart="onSosStart" @touchend="onSosEnd" @touchcancel="onSosEnd">
          <image class="action-btn-icon" src="/static/action/sos-warning-v2.png" mode="aspectFit" />
          <text class="action-btn-text">SOS</text>
        </view>
      </view>
    </view>

    <!-- ==================== Info Floating Window ==================== -->
    <UnifiedPopup
      :visible="infoWindow.visible"
      :user="infoWindow.data"
      :type="infoWindow.type"
      @close="closeInfoWindow"
      @message="onMessageFromPopup"
      @homepage="onHomepageFromPopup"
      @follow="onFollowFromPopup"
      @navigate="onNavigateFromPopup"
      @detail="onDetailFromPopup"
      @viewmembers="onViewMembersFromPopup"
      @forwardToChat="onForwardTrafficToChat"
      @setMeetup="onSetLeaderMeetup"
    />

    <!-- ==================== SOS Confirmation Dialog ==================== -->
    <view class="sos-overlay" v-if="sosConfirming" @tap="cancelSos">
      <view class="sos-dialog" @tap.stop>
        <view class="sos-dialog-icon">🆘</view>
        <text class="sos-dialog-title">确认发送紧急求助？</text>
        <text class="sos-dialog-desc">将向你的紧急联系人和附近救援站发送你的位置信息</text>
        <view class="sos-dialog-actions">
          <view class="sos-dialog-btn cancel" @tap="cancelSos">
            <text>取消</text>
          </view>
          <view class="sos-dialog-btn confirm" @tap="confirmSos">
            <text>确认发送</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ==================== D4: System Safety Alert Modal ==================== -->
    <view class="safety-alert-overlay" v-if="safetyAlert" @tap="dismissSafetyAlert">
      <view class="safety-alert-modal" @tap.stop>
        <view class="safety-alert-icon">⚠️</view>
        <text class="safety-alert-title">{{ safetyAlert.title }}</text>
        <text class="safety-alert-desc">{{ safetyAlert.content }}</text>
        <view class="safety-alert-actions">
          <view class="safety-btn ignore" @tap="dismissSafetyAlert">
            <text>忽略</text>
          </view>
          <view class="safety-btn detail" @tap="viewSafetyDetail">
            <text>查看详情</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { useUserStore } from '@/store/user.js';
import { useTripStore } from '@/store/trip.js';
import { useChatStore } from '@/store/chat.js';
import api, { locationApi, mapApi, userApi } from '@/utils/api.js';
import UnifiedPopup from '@/components/UnifiedPopup.vue';

export default {
  components: {
    UnifiedPopup
  },

  data() {
    return {
      // ---- Map State ----
      mapCenter: {
        latitude: 30.6598,
        longitude: 104.0633
      },
      mapScale: 12,
      trafficEnabled: true,
      mapReady: false,
      mapLoadTimeout: null,
      isH5Mode: false,
      mapSdkError: false,
      mapSdkCheckTimer: null,

      // ---- Location State ----
      currentLocation: null,
      currentAltitude: 0,
      currentSpeed: 0,
      currentHeading: 0,

      // ---- Status Bar ----
      statusBarHeight: 44,
      weather: null,
      dayCounter: 1,
      remainingDays: 7,

      // ---- Markers Data ----
      allMarkers: {
        teammates: [],
        otherTeams: [],
        merchants: [],
        pois: [],
        trafficEvents: [],
        chatRooms: [],
        safetyPois: []
      },
      routePolyline: [],

      // ---- Layer Toggle ----
      showLayerPanel: false,
      layers: [
        { key: 'teammates', label: '队友位置', desc: '显示同行队友实时位置', visible: true, color: '#07C160' },
        { key: 'otherTeams', label: '附近车队', desc: '显示周边自驾车队', visible: true, color: '#4A90D9' },
        { key: 'merchants', label: '团购商家', desc: '显示团购/优惠商家', visible: false, color: '#FF6B35' },
        { key: 'pois', label: '兴趣点', desc: '显示景点、营地、加油充电站', visible: true, color: '#F5A623' },
        { key: 'trafficEvents', label: '路况事件', desc: '显示堵车、事故、封路', visible: true, color: '#E74C3C' },
        { key: 'chatRooms', label: '位置聊天', desc: '显示附近的聊天气泡', visible: true, color: '#9B59B6' },
        { key: 'safetyPois', label: '安全POI', desc: '显示救援站、医院、修车点', visible: true, color: '#2ECC71' }
      ],

      // ---- Info Window ----
      infoWindow: {
        visible: false,
        type: 'teammate',
        data: null
      },

      // ---- Location Report Timer ----
      locationReportTimer: null,
      mapDataRefreshTimer: null,
      unreadPollTimer: null,

      // ---- Share Location ----
      shareLocationOn: true,

      // ---- SOS ----
      sosTimer: null,
      sosConfirming: false,
      sosHolding: false,

      // ---- B2: 集合点 marker ----
      meetupPoint: null,

      // ---- B6: 燃油/充电焦虑提醒 ----
      fuelAnxiety: null,

      // ---- D2/D3: 消息通知 + 跨车队私信 ----
      notifications: null,
      mapBounds: null,
      mapBoundsThrottle: null,

      // ---- D4: 系统安全通知弹窗 ----
      safetyAlert: null
    };
  },

  computed: {
    userStore() {
      return useUserStore();
    },

    tripStore() {
      return useTripStore();
    },

    chatStore() {
      return useChatStore();
    },

    unreadCount() {
      return this.chatStore.unreadTotal;
    },

    /**
     * 是否显示标记的名称标签(缩放联动:放得越大越显示,缩小后只保留聚合气泡)
     * 优化:不再常显名字,避免标记重叠时文字互相遮挡;名称在点击标记后通过气泡展示
     */
    showMarkerLabels() {
      return false;
    },

    /**
     * Assemble display markers based on visible layers
     */
    displayMarkers() {
      const layerMap = {
        teammates: this.buildTeammateMarkers,
        otherTeams: this.buildOtherTeamMarkers,
        merchants: this.buildMerchantMarkers,
        pois: this.buildPoiMarkers,
        trafficEvents: this.buildTrafficEventMarkers,
        chatRooms: this.buildChatRoomMarkers,
        safetyPois: this.buildSafetyPoiMarkers
      };

      // 优化:所有图层统一参与聚合,标记密集时合并为数字气泡,放大才逐步展开
      const layerMarkers = [];

      this.layers.forEach((layer) => {
        if (layer.visible && layerMap[layer.key]) {
          const built = layerMap[layer.key]();
          for (const m of built) {
            // 缓存 key 带图层前缀,避免不同图层(队友/商家/聊天室)数字 id 撞车
            layerMarkers.push({
              cacheKey: layer.key + ':' + (m.id !== undefined && m.id !== null ? m.id : m.latitude + ',' + m.longitude),
              marker: m
            });
          }
        }
      });

      const out = [];

      // B3: 渐进式展开(靠近地图中心的先显示,放大逐步增多;其余网格聚合)
      const clustered = this.clusterMarkers(layerMarkers.map((x) => x.marker), this.mapScale);
      clustered.forEach((m) => {
        // 聚合气泡使用独立的 cluster 命名空间(负 id 可能与其他图层重复)
        const key = (typeof m.id === 'number' && m.id < 0)
          ? 'cluster:' + m.id
          : this._findLayerCacheKey(layerMarkers, m);
        out.push(this.stableMarker(key, m));
      });

      // B1: 终点旗帜 marker - 常驻显示,不走 layers 开关,放在聚合之后不参与聚合
      if (this.tripStore.hasCurrentTrip) {
        for (const m of this.buildEndFlagMarker()) {
          out.push(this.stableMarker('end_flag:' + m.id, m));
        }
      }

      // B2: 集合点 marker - 用户点击"设为集合点"后常驻显示
      for (const m of this.buildMeetupPointMarker()) {
        out.push(this.stableMarker('meetup:' + m.id, m));
      }

      // D3: 跨车队私信视野内气泡(常驻,不走 layers 开关)
      for (const m of this.buildCrossTeamMessageMarkers()) {
        out.push(this.stableMarker('cross:' + m.id, m));
      }

      // 数据未变化时返回同一 marker 对象引用,避免 uni-h5 每次 props 更新都重建
      // ALWAYS callout(Text 叠加不清理会导致气泡重复堆积和卡顿)
      // 统一规范化 id 为数字(微信小程序要求),同时不破坏 stableMarker 缓存 key
      return out.map((m) => this._normalizeMarkerId(m));
    },

    /**
     * Compute includePoints for the map (fit nearby team members only)
     */
    includePoints() {
      const points = [];
      const isValidCoord = (lat, lng) =>
        typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

      if (this.shareLocationOn && this.tripStore.hasActiveTrip) {
        const me = this.currentLocation;
        this.allMarkers.teammates.forEach((m) => {
          if (isValidCoord(m.latitude, m.longitude)) {
            // 只适配附近队友(50km 内,最多 20 人),避免成员分散在全国时
            // 地图被 include-points 强制缩到全国视野,导致定位"消失"和大量聚合蓝标
            if (me && this.calcSimpleDistance(me.latitude, me.longitude, m.latitude, m.longitude) > 50) {
              return;
            }
            if (points.length >= 20) return;
            points.push({ latitude: m.latitude, longitude: m.longitude });
          }
        });
      }
      // 当前行程的起终点也纳入视野，避免广州出发、北京终点时终点在屏幕外。
      // 只加入端点而不加入整条 path，避免大量路线采样点触发频繁重绘。
      if (this.tripStore.hasCurrentTrip) {
        const trip = this.tripStore.currentTrip;
        [trip.startPointData, trip.endPointData].forEach((point) => {
          const latitude = Number(point && (point.lat ?? point.latitude));
          const longitude = Number(point && (point.lng ?? point.longitude));
          if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
            points.push({ latitude, longitude });
          }
        });
      }

      // 地图本身已以当前定位为中心(latitude/longitude),不需要把当前点重复塞进 includePoints
      // 同一组坐标返回同一数组引用,避免每次定位上报都触发地图重新 fit(跳动/卡顿)
      const key = JSON.stringify(points);
      if (this._includePointsKey === key && this._includePointsValue) {
        return this._includePointsValue;
      }
      this._includePointsKey = key;
      this._includePointsValue = points;
      return points;
    }
  },

  /**
   * Lifecycle: Component Created
   */
  created() {
    // 非响应式缓存:marker 对象去重 + includePoints 去重 + 地图数据请求节流
    this._markerCache = new Map();
    this._includePointsKey = '';
    this._includePointsValue = null;
    this._lastMapDataFetch = 0;
    this._mapDataFetching = false;
    this._locationFallback = false;
    this._routeFailNotified = false;
    // 字符串 marker id(userId/merchantId/poiId 等可能是 MongoDB ObjectId)→ 负数数字 id 映射,
    // 微信小程序 <map> 要求 marker id 为数字。_revIdMap 用于点击时反查原始 id。
    this._stringIdMap = new Map();
    this._revIdMap = new Map();
    this._nextStringId = -3;
    // 微信小程序点击 marker 时可能同时触发 map tap；短暂屏蔽后者，避免浮窗一闪即逝
    this._suppressMapTapUntil = 0;
  },

  /**
   * Lifecycle: Page Load
   */
  onLoad() {
    // Get system info for status bar height
    const systemInfo = uni.getSystemInfoSync();
    this.statusBarHeight = systemInfo.statusBarHeight || 44;

    // Initialize map: get user location
    this.initPage();

    // D4: 监听来自 App.vue 的高优先级系统通知,弹安全提醒 modal
    uni.$on('system_notification_high', this.showSafetyAlertModal);
  },

  /**
   * Lifecycle: Page Show
   */
  onShow() {
    // Refresh trip status when page shows. During app startup the token may
    // exist before the async profile restore flips isLoggedIn to true.
    const hasStoredToken = !!uni.getStorageSync('token');
    if (this.userStore.isLoggedIn || hasStoredToken) {
      this.tripStore.fetchCurrentTrip()
        .then(async () => {
          // 行程可能在创建/编辑后变化,重新计算 Day 与剩余天数
          if (this.tripStore.hasCurrentTrip) {
            this.calcTripCounters();
          }
          await this.fetchTripRoutePolyline();
        })
        .catch(() => {});
      this.chatStore.fetchUnread().catch(() => {});
      this.fetchProfile();
    }

    // Resume timers
    this.startTimers();
  },

  /**
   * Lifecycle: Page Hide
   */
  onHide() {
    this.clearTimers();
  },

  /**
   * Lifecycle: Page Unload
   */
  onUnload() {
    this.clearTimers();
    // D4: 注销系统通知监听,避免重复触发
    uni.$off('system_notification_high', this.showSafetyAlertModal);
  },

  methods: {
    /**
     * 微信小程序 <map> 要求 marker.id 必须为数字。
     * 数据源的 id(userId/merchantId/teamId/poiId/eventId/roomId 等)可能是字符串
     * (如 MongoDB ObjectId),这里统一映射为稳定的负数数字 id。
     * ID 空间约定:
     *   -1 终点旗帜 / -2 集合点 / -3~-999 字符串 id 映射
     *   -1000~-999999 聚合气泡 / <=-1000000 跨车队消息
     */
    _normalizeMarkerId(marker) {
      if (!marker) return marker;
      const id = marker.id;
      // 有效数字直接保留;NaN 虽然 typeof 是 'number' 但不是合法 marker id,需一并映射
      if (typeof id === 'number' && !isNaN(id)) return marker;
      const key = (id === undefined || id === null || (typeof id === 'number' && isNaN(id)))
        ? marker.latitude + ',' + marker.longitude
        : String(id);
      let nid = this._stringIdMap.get(key);
      if (nid === undefined) {
        nid = this._nextStringId--;
        this._stringIdMap.set(key, nid);
        this._revIdMap.set(nid, key);
      }
      marker.id = nid;
      return marker;
    },

    // ==================== Map Error Handling ====================

    onMapError(e) {
      console.warn('Map error:', e);
      this.mapReady = false;
    },

    retryMap() {
      this.mapReady = false;
      setTimeout(() => {
        this.mapReady = true;
      }, 500);
    },

    /** H5:监测高德 SDK 是否加载成功,失败则提示(避免静默灰屏) */
    checkMapSdk() {
      this.clearMapSdkCheck();
      // #ifdef H5
      this.mapSdkCheckTimer = setTimeout(() => {
        if (typeof window !== 'undefined' && window.AMap === undefined) {
          this.mapSdkError = true;
        }
      }, 8000);
      // #endif
    },

    clearMapSdkCheck() {
      if (this.mapSdkCheckTimer) {
        clearTimeout(this.mapSdkCheckTimer);
        this.mapSdkCheckTimer = null;
      }
    },

    /** 重新加载地图 SDK */
    retryMapSdk() {
      this.mapSdkError = false;
      this.mapReady = false;
      setTimeout(() => {
        this.mapReady = true;
        this.checkMapSdk();
      }, 500);
    },

    // ==================== Initialization ====================

    async initPage() {
      try {
        // Get user location
        const location = await this.getUserLocation();
        this.currentLocation = location;
        this.mapCenter = {
          latitude: location.latitude,
          longitude: location.longitude
        };

        // getUserLocation 内部已兜底,不会抛错,这里显式判断是否真正定位失败
        if (this._locationFallback) {
          uni.showToast({
            title: '定位失败，使用默认位置',
            icon: 'none',
            duration: 2000
          });
        }

        // 先取行程(终点旗帜/集合点/路线都依赖它,定位失败时也要用它回退起点)
        const hasStoredToken = !!uni.getStorageSync('token');
        if (this.userStore.isLoggedIn || hasStoredToken) {
          await this.tripStore.fetchCurrentTrip();
          // 定位失败时,若存在行程则回退到行程起点,避免地图定位到错误城市
          if (this._locationFallback && this.tripStore.currentTrip) {
            const sp = this.tripStore.currentTrip.startPointData;
            if (sp && typeof sp.lat === 'number' && typeof sp.lng === 'number') {
              this.currentLocation = { ...this.currentLocation, latitude: sp.lat, longitude: sp.lng };
              this.mapCenter = { latitude: sp.lat, longitude: sp.lng };
            }
          }
          if (this.tripStore.hasActiveTrip) {
            this.calcTripCounters();
            await this.tripStore.fetchTripMembers(this.tripStore.currentTrip.id);
            await this.fetchTeamLocations();
          }
        }

        // 围绕最终中心点拉取地图数据(定位失败回退到行程起点后,数据范围也保持一致)
        await this.fetchMapData();

        // Fetch weather
        this.fetchWeather(this.mapCenter.latitude, this.mapCenter.longitude);

        // Start periodic timers
        this.startTimers();

        // Mark map as ready
        this.mapReady = true;
        this.checkMapSdk();
      } catch (err) {
        // 定位失败已在 getUserLocation 内部兜底,能走到这里的是接口/网络等异常
        console.error('[Map] initPage failed:', err);
        uni.showToast({
          title: '服务暂不可用，请检查网络后重试',
          icon: 'none',
          duration: 2000
        });
        // 坐标已在 getUserLocation 中确定(真实定位/行程起点/默认坐标),此处不再覆盖,避免地图被拽到北京
        this.mapReady = true;
        this.checkMapSdk();
      }
    },

    /**
     * Get user location via uni.getLocation
     */
    getUserLocation() {
      return new Promise((resolve) => {
        uni.getLocation({
          type: 'gcj02',
          altitude: true,
          isHighAccuracy: true,
          success: (res) => {
            this.currentAltitude = res.altitude || 0;
            this.currentSpeed = res.speed || 0;
            resolve({
              latitude: res.latitude,
              longitude: res.longitude,
              altitude: res.altitude || 0,
              speed: res.speed || 0,
              heading: 0
            });
          },
          fail: (err) => {
            console.error('[Map] getLocation fail (gcj02/highAccuracy):', err);
            // Try fallback with lower accuracy
            uni.getLocation({
              type: 'wgs84',
              success: (res) => {
                this.currentAltitude = 0;
                this.currentSpeed = 0;
                resolve({
                  latitude: res.latitude,
                  longitude: res.longitude,
                  altitude: 0,
                  speed: 0,
                  heading: 0
                });
              },
              fail: (err) => {
                // H5 模式下定位可能不可用,优先回退到行程起点,否则使用默认坐标(成都)
                console.error('[Map] getLocation fail (wgs84):', err);
                console.warn('[Map] 定位失败，使用默认位置');
                this._locationFallback = true;
                const trip = this.tripStore && this.tripStore.currentTrip;
                const sp = trip && trip.startPointData;
                const fallback = (sp && typeof sp.lat === 'number' && typeof sp.lng === 'number')
                  ? { latitude: sp.lat, longitude: sp.lng }
                  : { latitude: 30.5728, longitude: 104.0668 };
                this.currentAltitude = 0;
                this.currentSpeed = 0;
                resolve({
                  latitude: fallback.latitude,
                  longitude: fallback.longitude,
                  altitude: 0,
                  speed: 0,
                  heading: 0
                });
              }
            });
          }
        });
      });
    },

    async fetchProfile() {
      try {
        await this.userStore.fetchProfile();
      } catch (e) {
        // ignore
      }
    },

    // ==================== Timer Management ====================

    startTimers() {
      this.clearTimers();

      // Report location every 10 seconds
      this.locationReportTimer = setInterval(() => {
        this.reportLocation();
      }, 10000);

      // Refresh map data every 30 seconds
      this.mapDataRefreshTimer = setInterval(() => {
        this.fetchMapData();
      }, 30000);

      // Poll unread count every 15 seconds
      this.unreadPollTimer = setInterval(() => {
        if (this.userStore.isLoggedIn) {
          this.chatStore.fetchUnread().catch(() => {});
        }
      }, 15000);
    },

    clearTimers() {
      if (this.locationReportTimer) {
        clearInterval(this.locationReportTimer);
        this.locationReportTimer = null;
      }
      if (this.mapDataRefreshTimer) {
        clearInterval(this.mapDataRefreshTimer);
        this.mapDataRefreshTimer = null;
      }
      if (this.unreadPollTimer) {
        clearInterval(this.unreadPollTimer);
        this.unreadPollTimer = null;
      }
      this.clearMapSdkCheck();
    },

    // ==================== Location Reporting ====================

    async reportLocation() {
      try {
        const location = await this.getUserLocation();
        this.currentLocation = location;
        this.currentAltitude = location.altitude;
        this.currentSpeed = location.speed;

        // Report to server only if in active trip
        if (this.userStore.isLoggedIn && this.tripStore.hasActiveTrip && this.shareLocationOn) {
          await locationApi.reportLocation(
            location.longitude,
            location.latitude,
            location.altitude,
            location.speed,
            location.heading
          );
        }
      } catch (err) {
        // Silent fail for periodic reports
        console.warn('Location report failed:', err);
      }
    },

    async reportMyLocation() {
      try {
        const location = await this.getUserLocation();
        this.currentLocation = location;
        this.currentAltitude = location.altitude;

        const trip = this.tripStore.currentTrip;
        if (!trip || !trip.id || (trip.status !== 1 && trip.status !== 2)) {
          uni.showToast({
            title: '请先加入一个行程',
            icon: 'none'
          });
          return;
        }

        // 先解析当前行程对应的车队群会话,直接打开正确的群聊,避免发错群
        let sessionId = '';
        try {
          await this.chatStore.fetchSessions('team');
          const team = (this.chatStore.sessions || []).find(
            (s) => s.type === 'team' && String(s.tripId) === String(trip.id)
          );
          if (team) {
            sessionId = team.id;
          }
        } catch (err) {
          console.warn('[Map] resolve team session failed:', err);
        }

        uni.navigateTo({
          url: '/pages/message/chat?sessionId=' + sessionId +
            '&shareLocation=1&lat=' + location.latitude +
            '&lng=' + location.longitude + '&tripId=' + trip.id
        });
      } catch (err) {
        uni.showToast({
          title: '获取位置失败',
          icon: 'none'
        });
      }
    },

    // ==================== Map Data ====================

    async fetchMapData() {
      if (!this.currentLocation) return;

      // 节流 + 防重入:定时刷新/区域拖动都会触发本方法,避免并发请求与重复渲染
      const now = Date.now();
      if (this._mapDataFetching) return;
      if (this._lastMapDataFetch && now - this._lastMapDataFetch < 5000) return;
      this._lastMapDataFetch = now;
      this._mapDataFetching = true;

      try {
        const data = await locationApi.getMapData(
          this.currentLocation.longitude,
          this.currentLocation.latitude,
          this.mapScale
        );

        if (data) {
          // A1+A2+A4: 字段对齐 - 后端返回 nearby_teams, nearby_group_buys, chatRooms, pois(平铺数组), traffic_events.list, safety
          // 附近车队: 把 leader_position 转换为 latitude/longitude
          this.allMarkers.otherTeams = (data.nearby_teams || []).map((t) => ({
            id: t.trip_id || t.id,
            teamId: t.trip_id || t.id,
            name: t.trip_name || t.name || '车队',
            latitude: t.leader_position?.lat || t.latitude,
            longitude: t.leader_position?.lng || t.longitude,
            memberCount: t.member_count || t.memberCount || 0,
            carCount: t.car_count || t.carCount || 0,
            distance: t.distance_km ? t.distance_km + 'km' : '',
            leaderId: t.leader_id,
            leaderNickname: t.leader_nickname,
            leaderAvatar: t.leader_avatar
          }));

          // 拼团商家: 把 merchant_location 转换为 latitude/longitude
          this.allMarkers.merchants = (data.nearby_group_buys || []).map((m) => {
            const loc = m.merchant_location || m.location || {};
            // 计算当前价格(取 current_tier 或 price_tiers 第一个)
            let groupBuyPrice = null;
            if (m.price_tiers && m.price_tiers.length > 0) {
              const sortedTiers = [...m.price_tiers].sort((a, b) => a.count - b.count);
              groupBuyPrice = sortedTiers[0].price;
            }
            return {
              id: m.activity_id || m.id,
              merchantId: m.merchant_id || m.id,
              name: m.product_name || m.merchant_name || '拼团商品',
              latitude: loc.lat || m.latitude,
              longitude: loc.lng || m.longitude,
              tag: m.current_count ? `${m.current_count}/${m.target_count}人` : '拼团中',
              discountTag: '🔥拼团中',
              price: groupBuyPrice,
              originalPrice: m.original_price,
              hasActiveGroupBuy: true,
              groupBuyPrice: groupBuyPrice
            };
          });

          // A1: POI 已是平铺数组,字段名匹配
          this.allMarkers.pois = data.pois || [];

          // A4: 路况事件(后端 traffic_events.list 已含 latitude/longitude)
          this.allMarkers.trafficEvents = (data.traffic_events && data.traffic_events.list) || [];

          // A2+B7: 聊天室 - 后端返回 poi_location:{lng,lat},但 filterValidCoords 需要 latitude/longitude 字段
          // 修复 A2 遗留 bug:从 poi_location 提取 latitude/longitude,否则聊天室图层永远为空
          this.allMarkers.chatRooms = (data.chatRooms || data.nearby_topics || []).map((c) => {
            const loc = c.poi_location || c.location || {};
            return {
              ...c,
              latitude: loc.lat || c.latitude,
              longitude: loc.lng || c.longitude
            };
          });

          // 安全 POI: 合并 police_stations 和 hospitals
          const safety = data.safety || {};
          const safetyList = [
            ...(safety.police_stations || []).map((s) => ({ ...s, type: 'police' })),
            ...(safety.hospitals || []).map((s) => ({ ...s, type: 'hospital' }))
          ];
          this.allMarkers.safetyPois = safetyList;

          // A3: 天气数据消费 - 后端 weather 已含 icon/temp 字段
          if (data.weather) {
            this.weather = {
              icon: data.weather.icon || '🌤️',
              temp: data.weather.temp !== null && data.weather.temp !== undefined
                ? data.weather.temp
                : (data.weather.temperature ? parseInt(data.weather.temperature) : 0),
              desc: data.weather.desc || data.weather.weather || ''
            };
          }

          // B6: 燃油/充电焦虑提醒消费
          if (data.fuelAnxietyCheck) {
            this.fuelAnxiety = data.fuelAnxietyCheck;
          }
          // D2: 消息通知分级消费(本队群聊未读/跨车队私信/好友私信/系统营销)
          if (data.notifications) {
            this.notifications = data.notifications;
          }

          // A7: 行程卡片数据源 - 设置 destinationName 和 distanceToDest
          if (this.tripStore.currentTrip && this.tripStore.currentTrip.endPointData) {
            const ep = this.tripStore.currentTrip.endPointData;
            const destName = ep.name || ep.address || '终点';
            // 估算剩余距离(当前用户位置到终点的直线距离)
            const destLng = ep.lng || ep.longitude;
            const destLat = ep.lat || ep.latitude;
            if (destLng && destLat && this.currentLocation) {
              // 简单直线距离 * 1.3 修正系数
              const directDist = this.calcSimpleDistance(
                this.currentLocation.latitude,
                this.currentLocation.longitude,
                destLat,
                destLng
              );
              const roadDist = Math.round(directDist * 1.3 * 10) / 10;
              this.$setTripDestination(destName, roadDist);
            }
          }
        }

        // A6: 行程路线 polyline 绘制
        await this.fetchTripRoutePolyline();
      } catch (err) {
        console.warn('Failed to fetch map data:', err);
      } finally {
        this._mapDataFetching = false;
      }
    },

    /**
     * A6: 获取行程路线 polyline
     */
    async fetchTripRoutePolyline() {
      if (!this.tripStore.hasCurrentTrip) {
        this.routePolyline = [];
        return;
      }

      const trip = this.tripStore.currentTrip;
      const startPoint = trip.startPointData;
      const endPoint = trip.endPointData;
      if (!startPoint || !endPoint) {
        this.routePolyline = [];
        return;
      }

      const originLng = startPoint.lng ?? startPoint.longitude;
      const originLat = startPoint.lat ?? startPoint.latitude;
      const destLng = endPoint.lng ?? endPoint.longitude;
      const destLat = endPoint.lat ?? endPoint.latitude;
      if (originLng == null || originLat == null || destLng == null || destLat == null) {
        this.routePolyline = [];
        return;
      }

      try {
        let routeInfo = trip.routeData || trip.route_data;
        if (!routeInfo) {
          routeInfo = await mapApi.getRouteInfo(
            { lng: originLng, lat: originLat },
            { lng: destLng, lat: destLat },
            trip.waypoints || []
          );
        }

        // 高德真实道路轨迹位于 segments[*].polyline；path 仅是起点/途经点/终点
        // 的简化路径。必须优先使用 polyline，否则长途路线会被画成直线。
        let roadPath = [];
        if (routeInfo && Array.isArray(routeInfo.segments)) {
          for (const segment of routeInfo.segments) {
            if (!segment.polyline || typeof segment.polyline !== 'string') continue;
            for (const pair of segment.polyline.split(';')) {
              const [lng, lat] = pair.split(',').map(Number);
              if (Number.isFinite(lng) && Number.isFinite(lat)) {
                const previous = roadPath[roadPath.length - 1];
                if (!previous || previous.lng !== lng || previous.lat !== lat) {
                  roadPath.push({ lng, lat });
                }
              }
            }
          }
        }
        const rawRoadPath = roadPath.length > 1
          ? roadPath
          : (routeInfo && Array.isArray(routeInfo.path) ? routeInfo.path : []);
        // 微信地图原生组件不适合承载上万采样点；等距抽稀保留道路形状，
        // 同时避免 setData/props 过大导致路线被截断成异常直线。
        const maxPolylinePoints = 1000;
        const rawPath = rawRoadPath.length <= maxPolylinePoints
          ? rawRoadPath
          : Array.from({ length: maxPolylinePoints }, (_, index) => {
            const sourceIndex = Math.round(index * (rawRoadPath.length - 1) / (maxPolylinePoints - 1));
            return rawRoadPath[sourceIndex];
          });

        const points = rawPath
          .map((point) => ({
            latitude: Number(point.lat ?? point.latitude),
            longitude: Number(point.lng ?? point.longitude)
          }))
          .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

        if (points.length > 1) {
          this.routePolyline = [{
            points,
            color: '#07C160',
            width: 6,
            dottedLine: !!(routeInfo && routeInfo.api_integration && routeInfo.api_integration.status === 'not_configured'),
            arrowLine: true,
            borderColor: '#06AD55',
            borderWidth: 1
          }];
        } else {
          this.routePolyline = [];
          this.notifyRouteUnavailable(routeInfo);
        }
      } catch (err) {
        console.warn('Failed to fetch route polyline:', err);
        this.routePolyline = [];
      }
    },
    /**
     * 路线规划不可用提示(每个会话只提示一次,避免 30s 轮询重复弹)
     */
    notifyRouteUnavailable(routeInfo) {
      if (this._routeFailNotified) return;
      this._routeFailNotified = true;
      const hint = (routeInfo && routeInfo.hint) || '路线规划暂不可用';
      uni.showToast({
        title: hint.indexOf('失败') !== -1 ? '路线规划失败' : '路线规划暂不可用',
        icon: 'none',
        duration: 2500
      });
      console.warn('[Map] route unavailable:', hint);
    },

    /**
     * A7: 设置当前行程的终点信息
     */
    $setTripDestination(name, distance) {
      if (this.tripStore.currentTrip) {
        this.tripStore.currentTrip.destinationName = name;
        this.tripStore.currentTrip.distanceToDest = distance;
      }
    },

    /**
     * 简单距离计算(Haversine 公式)
     */
    calcSimpleDistance(lat1, lng1, lat2, lng2) {
      const R = 6371; // km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    async fetchTeamLocations() {
      try {
        const locations = await locationApi.getTeamLocations();
        if (locations) {
          const members = Array.isArray(locations) ? locations : locations.members || [];
          // B2: 字段映射 - 后端返回 lng/lat/is_leader/user_id,前端统一为 latitude/longitude/userId
          this.allMarkers.teammates = members.map((m) => ({
            ...m,
            userId: m.userId || m.user_id,
            latitude: m.latitude != null ? m.latitude : m.lat,
            longitude: m.longitude != null ? m.longitude : m.lng,
            is_leader: m.is_leader || 0,
            updateTime: m.updateTime || m.last_update_time
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch team locations:', err);
      }
    },

    async fetchWeather(lat, lng) {
      // A3: 天气数据由 fetchMapData 获取后端的 weather 字段
      // 这里只做兜底:如果 fetchMapData 还未返回,显示默认值
      if (!this.weather) {
        this.weather = {
          icon: '🌤️',
          temp: null,
          desc: '加载中'
        };
      }
    },

    // ==================== Trip Counters ====================

    calcTripCounters() {
      const trip = this.tripStore.currentTrip;
      if (trip) {
        // 行程数据统一使用 departureTime + estimatedDays(startDate/endDate 字段不存在)
        const departure = trip.departureTime || trip.departure_time;
        const estimatedDays = trip.estimatedDays !== undefined
          ? trip.estimatedDays
          : (trip.estimated_days || 0);

        // Calculate day counter from trip start date
        if (departure) {
          const start = new Date(departure);
          const now = new Date();
          const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24)) + 1;
          this.dayCounter = Math.max(1, diffDays);
        }

        // Calculate remaining days: 与行程预计天数对应
        // 第 1 天显示剩余总天数,之后随日期推进递减,最后一天为 1
        if (estimatedDays > 0) {
          this.remainingDays = Math.max(0, estimatedDays - this.dayCounter + 1);
        }
      }
    },

    // ==================== Marker Builders ====================

    /**
     * Filter markers with valid coordinates only
     */
    filterValidCoords(items) {
      if (!Array.isArray(items)) return [];
      return items.filter((item) =>
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number' &&
        !isNaN(item.latitude) &&
        !isNaN(item.longitude)
      );
    },

    /**
     * Marker 对象去重缓存:数据未变化时返回同一对象引用。
     * uni-h5 的 ALWAYS callout 每次 setOption 都会新建一个 AMap Text 且不清理旧节点,
     * 只要 marker props 被更新就会叠出重复气泡(如 🏁 终点连续出现多个)并拖慢渲染。
     * 通过让未变化的数据保持同一引用,Vue 跳过 props patch,从而避免无谓重建。
     */
    stableMarker(key, marker) {
      if (!marker || key === undefined || key === null) return marker;
      const sig = JSON.stringify(marker);
      const cached = this._markerCache.get(key);
      if (cached && cached.sig === sig) return cached.obj;
      const obj = { ...marker };
      this._markerCache.set(key, { sig, obj });
      return obj;
    },

    /**
     * 根据 marker 对象引用找回它的图层缓存 key
     */
    _findLayerCacheKey(layerMarkers, marker) {
      const found = layerMarkers.find((x) => x.marker === marker);
      return found ? found.cacheKey : 'marker:' + String(marker.id);
    },

    /**
     * B3: 细节层渐进式展开
     * - 靠近地图中心的标记优先直接展开,越远的越晚出现
     * - 每放大一档,允许直接展开的数量约翻倍(scale 10→2 个,12→8 个,14→32 个,16→128 个...)
     * - 超出数量的其余标记按网格聚合,网格随缩放逐步缩小,聚合气泡随之拆分
     * 固定字符串 ID 的 marker(终点旗帜/集合点/跨车队消息)不在此处理,由 displayMarkers 在聚合后追加
     */
    clusterMarkers(markers, scale) {
      if (!markers || markers.length === 0) return [];
      const s = scale || 12;

      // 渐进阈值:优化后更激进,默认缩放下只直接展开极少数靠近中心的标记,
      // 放大到 14 级以上才逐步拆开(带上下限)
      const limit = Math.min(100, Math.max(1, Math.round(Math.pow(2, s - 12))));

      // 网格随缩放缩小:放大后聚合气泡逐步拆开成单个标记
      let gridSize;
      if (s >= 16) gridSize = 0.008;
      else if (s >= 15) gridSize = 0.012;
      else if (s >= 14) gridSize = 0.02;
      else if (s >= 13) gridSize = 0.04;
      else if (s >= 12) gridSize = 0.06;
      else if (s >= 11) gridSize = 0.12;
      else if (s >= 10) gridSize = 0.18;
      else gridSize = 0.18;

      // 按距地图中心的距离排序,最近的优先直接展开
      const center = this.mapCenter || { latitude: 30.6, longitude: 104.06 };
      const ordered = markers
        .map((m) => ({
          m,
          d: (typeof m.latitude === 'number' && typeof m.longitude === 'number')
            ? Math.pow(m.latitude - center.latitude, 2) + Math.pow(m.longitude - center.longitude, 2)
            : Infinity
        }))
        .sort((a, b) => a.d - b.d);

      const shown = [];
      const rest = [];
      ordered.forEach((x, i) => {
        if (i < limit) shown.push(x.m);
        else rest.push(x.m);
      });

      if (rest.length === 0) return shown;

      // 其余标记按网格聚合
      const grid = {};
      rest.forEach((m) => {
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return;
        const gridLng = Math.floor(m.longitude / gridSize);
        const gridLat = Math.floor(m.latitude / gridSize);
        const key = gridLng + '_' + gridLat;
        if (!grid[key]) {
          grid[key] = { count: 0, lat: 0, lng: 0, markers: [] };
        }
        grid[key].count++;
        grid[key].lat += m.latitude;
        grid[key].lng += m.longitude;
        grid[key].markers.push(m);
      });

      // 构造聚合 marker(负数 ID 避免与正数 markerId 冲突)
      // ID 空间:-1000~-999999 为聚合气泡(-1 终点旗帜/-2 集合点/-3~-999 字符串映射/<=-1000000 跨车队消息)
      let clusterId = -1000;
      Object.values(grid).forEach((cell) => {
        if (cell.count === 1) {
          // 网格内只有一个且超出当前可显示数量:先隐藏
          // 放大后 limit 翻倍、网格缩小,它会作为"最近的标记"逐步出现
          // 避免缩小地图时远处孤立点全部漏出导致满屏标记
        } else {
          // 多个 marker:聚合为蓝色数字气泡(用 label 而非 ALWAYS callout,
          // 避免缩放/刷新时 callout 重复叠加,也避免 1x1 图标被当成"蓝标"图标)
          shown.push({
            id: clusterId--,
            latitude: cell.lat / cell.count,
            longitude: cell.lng / cell.count,
            iconPath: '/static/default-avatar.png',
            width: 1,
            height: 1,
            label: {
              content: '📍 ' + cell.count,
              fontSize: 12,
              color: '#FFFFFF',
              anchorX: 0,
              anchorY: -4,
              bgColor: '#4A90D9',
              borderRadius: 12,
              padding: 6,
              borderWidth: 1,
              borderColor: '#3B7BC0'
            },
            callout: {
              content: cell.count + ' 个地点,继续放大地图查看',
              display: 'BYCLICK',
              fontSize: 12,
              borderRadius: 8,
              padding: 8,
              bgColor: '#4A90D9',
              color: '#FFFFFF'
            },
            anchor: { x: 0.5, y: 0.5 }
          });
        }
      });
      return shown;
    },

    buildTeammateMarkers() {
      if (!this.shareLocationOn) return [];
      // 排除自己:地图已开启 show-location 显示当前位置蓝点,
      // 若队友列表也包含自己会出现"车标 + 定位点"重复标记
      const myId = this.userStore && this.userStore.userId;
      const teammates = this.filterValidCoords(this.allMarkers.teammates).filter((m) => {
        const memberId = m.userId || m.user_id || m.id;
        return memberId !== undefined && memberId !== null && String(memberId) !== String(myId);
      });
      return teammates.map((m) => {
        // B2: 队长标识 - is_leader===1 用 👑 + 更大尺寸 + 金色背景
        const isLeader = m.is_leader === 1;
        const nickname = m.nickname || m.name || '队友';
        return {
          id: m.userId || m.id,
          latitude: m.latitude,
          longitude: m.longitude,
          // 优化:统一使用车标,不再用用户头像作图标,避免头像与车标重复
          iconPath: '/static/map/marker-teammate.png',
          width: isLeader ? 48 : 40,          // 队长更大
          height: isLeader ? 48 : 40,
          callout: {
            content: (isLeader ? '👑 ' : '') + nickname,
            display: 'BYCLICK',
            fontSize: 13,
            borderRadius: 8,
            padding: 8,
            bgColor: isLeader ? '#FFF8E1' : '#ffffff',   // 队长金色背景
            color: isLeader ? '#FF8F00' : '#1A1A1A'
          },
          ...(this.showMarkerLabels ? {
            label: {
              content: (isLeader ? '👑 ' : '') + nickname,
              fontSize: 12,
              color: isLeader ? '#FF8F00' : '#07C160',
              anchorX: 0,
              anchorY: -4,
              bgColor: isLeader ? 'rgba(255,248,225,0.95)' : 'rgba(255,255,255,0.9)',
              borderRadius: 8,
              padding: 4,
              borderWidth: 1,
              borderColor: isLeader ? '#FFB300' : '#07C160'  // 队长金色边框
            }
          } : {}),
          rotate: m.heading || 0,
          anchor: { x: 0.5, y: 0.5 }
        };
      });
    },

    buildOtherTeamMarkers() {
      return this.filterValidCoords(this.allMarkers.otherTeams).map((t) => ({
        id: t.teamId || t.id,
        latitude: t.latitude,
        longitude: t.longitude,
        iconPath: '/static/map/marker-team.png',
        width: 44,
        height: 44,
        callout: {
          content: (t.name || '车队') + '\n' + (t.memberCount || 0) + '人在线',
          display: 'BYCLICK',
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          bgColor: '#ffffff',
          color: '#1A1A1A'
        },
        ...(this.showMarkerLabels ? {
          label: {
            content: t.name || '车队',
            fontSize: 11,
            color: '#4A90D9',
            anchorX: 0,
            anchorY: -4,
            bgColor: 'rgba(255,255,255,0.9)',
            borderRadius: 8,
            padding: 4,
            borderWidth: 1,
            borderColor: '#4A90D9'
          }
        } : {}),
        anchor: { x: 0.5, y: 0.5 }
      }));
    },

    buildMerchantMarkers() {
      return this.filterValidCoords(this.allMarkers.merchants).map((m) => {
        // E1: 拼团中标签 - hasActiveGroupBuy 且有价格时显示 🔥 拼团角标 + 橙色背景
        const hasGroupBuy = m.hasActiveGroupBuy === true && m.groupBuyPrice != null;
        const name = m.name || '商家';
        let calloutContent, calloutBg, markerWidth, markerHeight;
        if (hasGroupBuy) {
          // 有拼团:显示拼团价 + 名称,橙色背景,尺寸更大
          calloutContent = '🔥拼团中 · ¥' + m.groupBuyPrice + '\n' + name;
          calloutBg = '#FFF3ED';
          markerWidth = 40;
          markerHeight = 40;
        } else {
          // 无拼团:保持现有 callout
          calloutContent = name + '\n' + (m.tag || '');
          calloutBg = '#ffffff';
          markerWidth = 36;
          markerHeight = 36;
        }
        return {
          id: m.merchantId || m.id,
          latitude: m.latitude,
          longitude: m.longitude,
          iconPath: m.icon || '/static/map/marker-merchant.png',
          width: markerWidth,
          height: markerHeight,
          callout: {
            content: calloutContent,
            display: 'BYCLICK',
            fontSize: 12,
            borderRadius: 8,
            padding: 8,
            bgColor: calloutBg,
            color: hasGroupBuy ? '#FF6B35' : '#1A1A1A'
          },
          ...(this.showMarkerLabels ? {
            label: {
              content: m.discountTag || '',
              fontSize: 10,
              color: '#FFFFFF',
              anchorX: 0,
              anchorY: -2,
              bgColor: '#FF6B35',
              borderRadius: 6,
              padding: 3
            }
          } : {}),
          anchor: { x: 0.5, y: 0.5 }
        };
      });
    },

    buildPoiMarkers() {
      // 警察局/医院由"安全POI"图层负责展示,这里剔除避免同一地点出现双标;
      // 同时按距离排序并截断,防止一次渲染数百个 marker 导致卡顿
      const pois = this.filterValidCoords(this.allMarkers.pois)
        .filter((p) => p.type !== 'police' && p.type !== 'hospital')
        .slice()
        .sort((a, b) => (a.distance || a.distance_km || Infinity) - (b.distance || b.distance_km || Infinity))
        .slice(0, 60);
      return pois.map((p) => ({
        id: p.poiId || p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        iconPath: this.getPoiIcon(p.type),
        width: 32,
        height: 32,
        callout: {
          content: (p.name || 'POI') + '\n' + (p.subtitle || ''),
          display: 'BYCLICK',
          fontSize: 12,
          borderRadius: 8,
          padding: 8,
          bgColor: '#ffffff',
          color: '#1A1A1A'
        },
        ...(this.showMarkerLabels ? {
          label: {
            content: p.name || '',
            fontSize: 10,
            color: '#F5A623',
            anchorX: 0,
            anchorY: -4
          }
        } : {}),
        anchor: { x: 0.5, y: 0.5 }
      }));
    },

    buildTrafficEventMarkers() {
      return this.filterValidCoords(this.allMarkers.trafficEvents)
        .slice()
        .sort((a, b) => (a.distance_km || a.distance || Infinity) - (b.distance_km || b.distance || Infinity))
        .slice(0, 20)
        .map((e) => ({
          id: e.eventId || e.id,
          latitude: e.latitude,
          longitude: e.longitude,
          iconPath: this.getTrafficIcon(e.type),
          width: 32,
          height: 32,
          callout: {
            content: (e.title || '事件') + '\n' + (e.description || ''),
            display: 'BYCLICK',  // 详细内容点击查看;常驻摘要改用 label,避免 30s 刷新叠加重复气泡
            fontSize: 12,
            borderRadius: 8,
            padding: 8,
            bgColor: '#FFF3F0',
            color: '#E74C3C'
          },
          ...(this.showMarkerLabels ? {
            label: {
              content: e.title || '事件',
              fontSize: 11,
              color: '#E74C3C',
              anchorX: 0,
              anchorY: -2,
              bgColor: 'rgba(255,243,240,0.95)',
              borderRadius: 6,
              padding: 4,
              borderWidth: 1,
              borderColor: '#E74C3C'
            }
          } : {}),
          anchor: { x: 0.5, y: 0.5 }
        }));
    },

    buildChatRoomMarkers() {
      return this.filterValidCoords(this.allMarkers.chatRooms)
        .slice()
        .sort((a, b) => (a.distance_km || Infinity) - (b.distance_km || Infinity))
        .slice(0, 30)
        .map((c) => {
          // B7: callout 内容根据话题数动态显示
          const topicCount = c.topicCount || c.topic_count || 1;
          const activeUsers = c.activeUsers || c.online_count || 0;
          const poiName = c.poi_name || c.name || '位置';
          let calloutContent;
          if (topicCount === 1) {
            // 只有一个话题:直接显示话题名
            const topicName = c.topic_name || poiName;
            calloutContent = '💬 ' + topicName + '\n' + activeUsers + '人在聊';
          } else {
            // 多个话题:显示 POI 名 + 话题数 + 人数
            calloutContent = '💬 ' + poiName + '\n' + topicCount + '个话题 · ' + activeUsers + '人在聊';
          }
          return {
            id: c.roomId || c.id,
            latitude: c.latitude,
            longitude: c.longitude,
            iconPath: '/static/map/marker-chat.png',
            width: 36,
            height: 36,
            callout: {
              content: calloutContent,
              display: 'BYCLICK',  // 常驻入口由 label 承担,详情点击查看
              fontSize: 12,
              borderRadius: 8,
              padding: 8,
              bgColor: '#F8F0FF',
              color: '#9B59B6'
            },
            ...(this.showMarkerLabels ? {
              label: {
                content: poiName,
                fontSize: 11,
                color: '#9B59B6',
                anchorX: 0,
                anchorY: -4
              }
            } : {}),
            anchor: { x: 0.5, y: 0.5 }
          };
        });
    },

    /**
     * B1: 终点绿色旗帜 marker
     * 若有进行中行程,在终点位置显示绿色 🏁 标签
     * 用 label 而非 ALWAYS callout,避免地图数据刷新时出现多个重复终点气泡
     */
    buildEndFlagMarker() {
      const trip = this.tripStore.currentTrip;
      if (!trip || !trip.endPointData) return [];
      const ep = trip.endPointData;
      const lng = ep.lng || ep.longitude;
      const lat = ep.lat || ep.latitude;
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return [];
      const endPointName = ep.name || ep.address || '终点';
      return [{
        id: -1,  // 固定负数 ID,与正数 markerId 不冲突,微信小程序要求 id 为数字
        latitude: lat,
        longitude: lng,
        iconPath: '/static/default-avatar.png',  // 小程序端 iconPath 必填,用默认图兜底
        width: 1,  // 极小尺寸,视觉上隐藏 icon,只显示 callout
        height: 1,
        label: {
          content: '🏁 ' + endPointName,
          fontSize: 14,
          color: '#2ECC71',
          anchorX: 0,
          anchorY: -4,
          bgColor: 'rgba(232,245,233,0.95)',
          borderRadius: 8,
          padding: 6,
          borderWidth: 1,
          borderColor: '#2ECC71'
        },
        anchor: { x: 0.5, y: 0.5 }
      }];
    },

    buildSafetyPoiMarkers() {
      return this.filterValidCoords(this.allMarkers.safetyPois)
        .slice()
        .sort((a, b) => (a.distance || a.distance_km || Infinity) - (b.distance || b.distance_km || Infinity))
        .slice(0, 40)
        .map((s) => ({
          id: s.poiId || s.id,
          latitude: s.latitude,
          longitude: s.longitude,
          iconPath: this.getSafetyIcon(s.type),
          width: 34,
          height: 34,
          callout: {
            content: (s.name || '安全点') + '\n' + (s.distance ? s.distance + 'km' : ''),
            display: 'BYCLICK',  // 常驻摘要用 label,避免刷新时叠加重复气泡
            fontSize: 12,
            borderRadius: 8,
            padding: 8,
            bgColor: '#F0FFF4',
            color: '#2ECC71'
          },
          ...(this.showMarkerLabels ? {
            label: {
              content: s.name || '安全点',
              fontSize: 10,
              color: '#2ECC71',
              anchorX: 0,
              anchorY: -2,
              bgColor: 'rgba(240,255,244,0.95)',
              borderRadius: 6,
              padding: 4,
              borderWidth: 1,
              borderColor: '#2ECC71'
            }
          } : {}),
          anchor: { x: 0.5, y: 0.5 }
        }));
    },

    /**
     * Get POI icon based on POI type
     */
    getPoiIcon(type) {
      const iconMap = {
        scenic: '/static/map/poi-scenic.png',
        camp: '/static/map/poi-camp.png',
        gas: '/static/map/poi-gas.png',
        charge: '/static/map/poi-charge.png',
        food: '/static/map/poi-food.png',
        restroom: '/static/map/poi-restroom.png',
        parking: '/static/map/poi-parking.png'
      };
      return iconMap[type] || '/static/map/poi-default.png';
    },

    /**
     * Get traffic event icon based on type
     */
    getTrafficIcon(type) {
      const iconMap = {
        jam: '/static/map/traffic-jam.png',
        accident: '/static/map/traffic-accident.png',
        closure: '/static/map/traffic-closure.png',
        construction: '/static/map/traffic-construction.png',
        police: '/static/map/traffic-police.png'
      };
      return iconMap[type] || '/static/map/traffic-default.png';
    },

    /**
     * Get safety POI icon based on type
     */
    getSafetyIcon(type) {
      const iconMap = {
        hospital: '/static/map/safety-hospital.png',
        rescue: '/static/map/safety-rescue.png',
        repair: '/static/map/safety-repair.png',
        police: '/static/map/safety-police.png'
      };
      return iconMap[type] || '/static/map/safety-default.png';
    },

    // ==================== Marker / Map Interaction ====================

    /**
     * Handle marker tap - show info window
     */
    onMarkerTap(e) {
      // marker tap 与 map tap 可能连续派发，防止 map tap 紧接着关闭刚打开的浮窗
      this._suppressMapTapUntil = Date.now() + 500;
      const markerId = e.detail.markerId;
      if (!markerId) return;

      // 优化:点击聚合气泡(-1000~-999999)自动放大地图一级,让聚合的标记逐步展开
      // H5 端 markerId 可能为字符串("-1"),这里统一解析
      const numericId = typeof markerId === 'number' ? markerId : parseInt(markerId, 10);
      if (!isNaN(numericId) && numericId <= -1000 && numericId > -1000000) {
        const clusterMarker = this.displayMarkers.find(
          (m) => typeof m.id === 'number' && m.id === numericId
        );
        if (clusterMarker && typeof clusterMarker.latitude === 'number' && typeof clusterMarker.longitude === 'number') {
          this.mapCenter = {
            latitude: clusterMarker.latitude,
            longitude: clusterMarker.longitude
          };
        }
        this.mapScale = Math.min(18, this.mapScale + 1);
        return;
      }

      const markerData = this.findMarkerData(numericId);
      if (!markerData) return;

      this.infoWindow = {
        visible: true,
        type: markerData.type,
        data: markerData.data
      };
    },

    /**
     * Handle callout tap
     */
    onCalloutTap(e) {
      this.onMarkerTap(e);
    },

    /**
     * Find marker data by id
     */
    findMarkerData(markerId) {
      // B4/B5: 负数 ID 特判(终点旗帜/集合点/跨车队消息气泡),微信小程序要求 marker id 为数字
      if (typeof markerId === 'number') {
        if (markerId === -1 || markerId === -2) {
          // 终点旗帜 / 集合点不弹浮窗(callout 已常驻显示)
          return null;
        }
        if (markerId <= -1000000) {
          // D3: 跨车队私信气泡
          const senderId = -(markerId + 1000000);
          const msg = this.notifications && this.notifications.crossTeamMessages
            ? this.notifications.crossTeamMessages.find((m) => m.senderId === senderId)
            : null;
          if (msg) {
            return {
              type: 'stranger',
              data: this.normalizeMarkerData({
                id: msg.senderId,
                nickname: msg.senderName,
                lastMessage: msg.preview,
                messagePreview: {
                  sender: msg.senderName,
                  content: msg.preview,
                  time: null,
                  isUnread: true
                }
              }, 'stranger')
            };
          }
        }
        // -3~-999 为字符串 id 映射区,还原为原始 id 再走通用查找
        if (markerId >= -999 && markerId <= -3) {
          const orig = this._revIdMap.get(markerId);
          if (orig !== undefined) markerId = orig;
        }
      }

      // Search through all marker arrays
      const searches = [
        { key: 'teammates', type: 'teammate', idField: 'userId' },
        { key: 'otherTeams', type: 'other_team', idField: 'teamId' },
        { key: 'merchants', type: 'merchant', idField: 'merchantId' },
        { key: 'pois', type: 'poi', idField: 'poiId', dynamicType: true },  // B5: 动态判断 merchant_poi
        { key: 'trafficEvents', type: 'traffic_event', idField: 'eventId' },  // B4: 改为 traffic_event
        { key: 'chatRooms', type: 'poi', idField: 'roomId' },
        { key: 'safetyPois', type: 'poi', idField: 'poiId' }
      ];

      for (const search of searches) {
        const arr = this.allMarkers[search.key];
        const item = arr.find((m) => (m[search.idField] || m.id) === markerId);
        if (item) {
          // B5: pois 数组需根据 type 动态判断是否为商家类型
          let type = search.type;
          if (search.dynamicType) {
            const merchantTypes = ['gas', 'gas_station', 'charge', 'charging_station',
                                  'food', 'restaurant', 'hotel', 'accommodation',
                                  'repair', 'convenience'];
            if (merchantTypes.includes(item.type)) {
              type = 'merchant_poi';
            }
          }
          return {
            type,
            data: this.normalizeMarkerData(item, type)
          };
        }
      }
      return null;
    },

    /**
     * Normalize marker data into UnifiedPopup format
     */
    normalizeMarkerData(item, type) {
      const base = {
        id: item.id || item.userId || item.teamId || item.merchantId || item.poiId || item.eventId || item.roomId,
        nickname: item.nickname || item.name || '',
        avatar: item.avatar || '',
        level: item.level || 1,
        levelName: item.levelName || '初级车友',
        isCertified: item.isCertified || item.certified || false,
        distance: item.distance || '未知',
        speed: item.speed,
        lastUpdate: item.updateTime || item.lastUpdate || '',
        signature: item.signature || item.bio || item.description || ''
      };

      if (type === 'teammate') {
        return {
          ...base,
          ...item,
          isLeader: item.is_leader === 1,            // B2: 队长标识
          isMe: String(item.userId || item.user_id) === String(this.userStore.userId),
          lastMessage: item.lastMessage || null
        };
      }

      if (type === 'other_team') {
        return {
          ...base,
          teamName: item.name || '',
          memberCount: item.memberCount || 0,
          routeName: item.routeName || '',
          description: item.description || ''
        };
      }

      if (type === 'merchant') {
        return {
          ...base,
          ...item,
          merchantName: item.name || '',
          productName: item.productName || item.title || '',
          price: item.price,
          originalPrice: item.originalPrice,
          discountTag: item.discountTag || '',
          groupCount: item.groupCount || 0
        };
      }

      if (type === 'poi') {
        return {
          ...base,
          ...item,
          poiName: item.name || '',
          poiType: item.type || '',
          subtitle: item.subtitle || item.description || '',
          hasChatRoom: item.hasChatRoom || false,
          chatRoomId: item.chatRoomId || item.roomId || null
        };
      }

      // B5: 沿途商家(加油/充电/餐厅/酒店)
      if (type === 'merchant_poi') {
        return {
          ...base,
          ...item,
          poiType: item.type || '',
          rating: item.rating || null,
          tel: item.tel || null,
          address: item.address || '',
          distance: typeof item.distance === 'number'
            ? item.distance
            : (item.distance_km ? parseFloat(item.distance_km) : '')
        };
      }

      // B4: 路况事件
      if (type === 'traffic_event') {
        return {
          ...base,
          ...item,
          title: item.title || item.name || '',
          description: item.description || '',
          severity: item.severity || 'low',
          distance: typeof item.distance === 'number'
            ? item.distance
            : (item.distance_km ? parseFloat(item.distance_km) : '')
        };
      }

      return base;
    },

    /**
     * Close info window
     */
    closeInfoWindow() {
      this.infoWindow.visible = false;
      this.infoWindow.data = null;
    },

    /**
     * Map tap - close info window
     */
    onMapTap() {
      if (Date.now() < this._suppressMapTapUntil) return;
      if (this.infoWindow.visible) {
        this.closeInfoWindow();
      }
      if (this.showLayerPanel) {
        this.showLayerPanel = false;
      }
    },

    /**
     * Map region change
     */
    onRegionChange(e) {
      if (e.type === 'end') {
        // A5: 实时更新 mapScale,确保后端按 zoom 调整搜索半径
        if (e.detail && e.detail.scale) {
          this.mapScale = e.detail.scale;
        }
        // Fetch new map data when map region significantly changes
        this.fetchMapData();
        // D3: 更新地图视野边界(节流 500ms,用于跨车队私信气泡过滤)
        this.updateMapBoundsThrottled();
      }
    },

    /**
     * D3: 节流更新地图视野边界
     */
    updateMapBoundsThrottled() {
      if (this.mapBoundsThrottle) clearTimeout(this.mapBoundsThrottle);
      this.mapBoundsThrottle = setTimeout(() => {
        this.updateMapBounds();
      }, 500);
    },

    /**
     * D3: 获取地图实际视野边界(用于过滤视野内的跨车队私信)
     */
    updateMapBounds() {
      try {
        const mapCtx = uni.createMapContext('coroadMap', this);
        mapCtx.getRegion({
          success: (res) => {
            // H5 返回 { latitude:[..], longitude:[..] } 数组格式;
            // 小程序端返回 { southwest:{latitude,longitude}, northeast:{...} } 对象格式,需兼容
            const swLat = res.southwest ? res.southwest.latitude : (res.latitude ? res.latitude[0] : null);
            const swLng = res.southwest ? res.southwest.longitude : (res.longitude ? res.longitude[0] : null);
            const neLat = res.northeast ? res.northeast.latitude : (res.latitude ? res.latitude[1] : null);
            const neLng = res.northeast ? res.northeast.longitude : (res.longitude ? res.longitude[1] : null);
            if (swLat == null || swLng == null || neLat == null || neLng == null) return;
            this.mapBounds = {
              southwest: { lng: swLng, lat: swLat },
              northeast: { lng: neLng, lat: neLat }
            };
          },
          fail: () => {
            // H5 端 getRegion 可能不支持,fallback 用 mapCenter + mapScale 估算
            const scale = this.mapScale || 12;
            const latRange = 0.05 * Math.pow(2, 14 - scale);
            const lngRange = latRange * 1.3;
            this.mapBounds = {
              southwest: {
                lng: this.mapCenter.longitude - lngRange,
                lat: this.mapCenter.latitude - latRange
              },
              northeast: {
                lng: this.mapCenter.longitude + lngRange,
                lat: this.mapCenter.latitude + latRange
              }
            };
          }
        });
      } catch (e) {
        console.warn('[D3] updateMapBounds failed:', e);
      }
    },

    /**
     * D3: 构造跨车队私信视野内气泡 marker
     * 过滤 notifications.crossTeamMessages 中 senderLocation 在 mapBounds 内的项
     */
    buildCrossTeamMessageMarkers() {
      if (!this.notifications || !this.notifications.crossTeamMessages) return [];
      const bounds = this.mapBounds;
      return this.notifications.crossTeamMessages
        .filter((msg) => {
          if (!msg.senderLocation) return false;
          const lng = msg.senderLocation.lng;
          const lat = msg.senderLocation.lat;
          if (typeof lng !== 'number' || typeof lat !== 'number') return false;
          // 无边界数据时默认显示(首次加载)
          if (!bounds) return true;
          return lng >= bounds.southwest.lng && lng <= bounds.northeast.lng
              && lat >= bounds.southwest.lat && lat <= bounds.northeast.lat;
        })
        .map((msg) => {
          const sid = Number(msg.senderId);
          return {
          // 用减法而非加法,避免 senderId 为字符串时被当成拼接产生 NaN
          id: (isNaN(sid) ? -1000000 : -1000000 - sid),
          latitude: msg.senderLocation.lat,
          longitude: msg.senderLocation.lng,
          iconPath: '/static/default-avatar.png',  // 小程序端 iconPath 必填
          width: 28,  // 可见图标,保证可点击查看消息
          height: 28,
          callout: {
            content: '💬 新消息',
            display: 'BYCLICK',  // 常驻入口由 label 承担,避免刷新时重复叠加
            fontSize: 12,
            borderRadius: 8,
            padding: 8,
            bgColor: '#E74C3C',
            color: '#FFFFFF'
          },
          label: {
            content: '💬 新消息',
            fontSize: 11,
            color: '#FFFFFF',
            anchorX: 0,
            anchorY: -4,
            bgColor: 'rgba(231,76,60,0.95)',
            borderRadius: 6,
            padding: 4,
            borderWidth: 1,
            borderColor: '#C0392B'
          },
          anchor: { x: 0.5, y: 0.5 }
          };
        });
    },

    /**
     * C1: 长按地图创建话题入口
     * 小程序端 @longpress 事件 e.detail 含 {longitude, latitude}
     */
    async onMapLongPress(e) {
      if (!e || !e.detail) return;
      const lng = e.detail.longitude;
      const lat = e.detail.latitude;
      if (typeof lng !== 'number' || typeof lat !== 'number') return;

      uni.showModal({
        title: '创建位置话题',
        editable: true,
        placeholderText: '输入话题名称',
        success: async (res) => {
          if (!res.confirm || !res.content) return;
          const topicName = res.content.trim();
          if (!topicName) return;
          try {
            uni.showLoading({ title: '创建中...' });
            const poi_id = 'manual_' + lng.toFixed(4) + '_' + lat.toFixed(4);
            const result = await this.chatStore.createTopic({
              poi_id,
              poi_name: '地图位置 ' + lng.toFixed(2) + ',' + lat.toFixed(2),
              poi_location: { lng, lat },
              topic_name: topicName
            });
            uni.hideLoading();
            uni.showToast({ title: '创建成功', icon: 'success' });
            // 跳转聊天页
            if (result && result.sessionId) {
              uni.navigateTo({
                url: '/pages/message/chat?sessionId=' + result.sessionId + '&type=location_room'
              });
            }
            // 刷新地图数据
            this.fetchMapData();
          } catch (err) {
            uni.hideLoading();
            uni.showToast({ title: err.message || '创建失败', icon: 'none' });
          }
        }
      });
    },

    // ==================== Layer Toggle ====================

    toggleLayer(key, e) {
      const layer = this.layers.find((l) => l.key === key);
      if (layer) {
        layer.visible = e.detail.value;
      }
    },

    // ==================== Popup Event Handlers ====================

    onMessageFromPopup(user) {
      if (!this.userStore.isLoggedIn) {
        uni.navigateTo({ url: '/pages/login/index' });
        return;
      }
      uni.navigateTo({
        url: '/pages/message/chat?userId=' + user.id + '&nickname=' + encodeURIComponent(user.nickname || '')
      });
    },

    onHomepageFromPopup(user) {
      uni.navigateTo({
        url: '/pages/user/home?userId=' + user.id
      });
    },

    async onFollowFromPopup(user) {
      if (!this.userStore.isLoggedIn) {
        uni.navigateTo({ url: '/pages/login/index' });
        return;
      }
      if (!user || !user.id) {
        uni.showToast({ title: '无法获取关注对象', icon: 'none' });
        return;
      }
      // 其他车队 -> follow_type=2；个人/陌生人 -> follow_type=1
      const followType = this.infoWindow.type === 'other_team' ? 2 : 1;
      if (followType === 2) {
        const currentTrip = this.tripStore.currentTrip || {};
        const currentTripId = currentTrip.id || currentTrip.tripId || currentTrip.trip_id;
        if (currentTripId && String(currentTripId) === String(user.id)) {
          uni.showToast({ title: '不能关注自己的车队', icon: 'none' });
          return;
        }
      }
      try {
        uni.showLoading({ title: '关注中...' });
        await userApi.follow(user.id, followType);
        uni.hideLoading();
        uni.showToast({ title: '已关注', icon: 'success' });
        this.closeInfoWindow();
      } catch (err) {
        uni.hideLoading();
        uni.showToast({ title: (err && err.message) || '关注失败', icon: 'none' });
      }
    },
    onNavigateFromPopup(data) {
      if (!data || !data.latitude || !data.longitude) {
        uni.showToast({ title: '无法获取目标位置', icon: 'none' });
        return;
      }
      uni.openLocation({
        latitude: data.latitude,
        longitude: data.longitude,
        name: data.nickname || data.name || '目标点',
        address: data.address || '',
        scale: 16
      });
    },

    onViewMembersFromPopup(data) {
      return this.loadTeamMembersFromPopup(data);
    },

    async loadTeamMembersFromPopup(data) {
      if (this.infoWindow.type === 'other_team') {
        const teamId = data && (data.teamId || data.id);
        if (!teamId) {
          uni.showToast({ title: '无法获取车队信息', icon: 'none' });
          return;
        }
        if (data.membersExpanded) {
          this.infoWindow = {
            ...this.infoWindow,
            data: { ...data, membersExpanded: false }
          };
          return;
        }
        this.infoWindow = {
          ...this.infoWindow,
          data: { ...data, membersExpanded: true, membersLoading: true, members: [] }
        };
        try {
          const rows = await api.trip.getTripMembers(teamId);
          const members = (Array.isArray(rows) ? rows : []).map((member) => ({
            userId: member.user_id || member.userId || member.id,
            nickname: member.nickname || '未知用户',
            avatar: member.avatar || '',
            level: member.level || 1,
            isOwner: member.role === 1 || member.role === '1' || member.role === 'captain',
            isCertified: member.is_certified === 2 || member.isCertified === true,
            signature: member.signature || ''
          }));
          this.infoWindow = {
            ...this.infoWindow,
            data: { ...this.infoWindow.data, members, membersLoading: false }
          };
        } catch (err) {
          this.infoWindow = {
            ...this.infoWindow,
            data: { ...this.infoWindow.data, members: [], membersLoading: false, membersExpanded: true, membersError: true }
          };
          uni.showToast({ title: (err && err.message) || '成员加载失败', icon: 'none' });
        }
        return;
      }
      if (data.merchantId) {
        uni.navigateTo({ url: '/pages/merchant/detail?id=' + data.merchantId });
      } else if (data.poiId) {
        // Handle POI detail
        uni.showToast({ title: '查看详情', icon: 'none' });
      }
    },
    /**
     * B4: 转发路况事件到车队群聊
     * 1. 拉取车队群聊会话列表
     * 2. 弹出选择列表(uni.showActionSheet)
     * 3. 调用 chatStore.sendMessage 发送 location 类型消息
     */
    async onForwardTrafficToChat(trafficEvent) {
      if (!trafficEvent) return;
      // 1. 拉取车队群聊会话
      try {
        await this.chatStore.fetchSessions('team');
      } catch (err) {
        console.warn('fetch team sessions failed:', err);
      }
      const teamSessions = (this.chatStore.sessions || []).filter(
        (s) => s.type === 'team_group'
      );
      if (teamSessions.length === 0) {
        uni.showToast({ title: '暂无车队群聊', icon: 'none' });
        return;
      }
      // 2. 弹出选择列表(uni.showActionSheet 最多 6 项)
      const names = teamSessions.slice(0, 6).map((s) => s.name || '车队群');
      uni.showActionSheet({
        itemList: names,
        success: async (res) => {
          const session = teamSessions[res.tapIndex];
          if (!session) return;
          // 3. 转发路况
          try {
            uni.showLoading({ title: '转发中...' });
            await this.chatStore.sendMessage(session.id, {
              type: 'location',
              content: '🚨 路况提醒: ' + (trafficEvent.title || trafficEvent.nickname || '路况事件'),
              extra: {
                traffic_event: {
                  id: trafficEvent.id,
                  type: trafficEvent.type,
                  title: trafficEvent.title || trafficEvent.nickname,
                  description: trafficEvent.description || '',
                  severity: trafficEvent.severity || 'low',
                  location: {
                    lng: trafficEvent.longitude,
                    lat: trafficEvent.latitude
                  }
                }
              }
            });
            uni.hideLoading();
            uni.showToast({ title: '已转发到群聊', icon: 'success' });
            this.closeInfoWindow();
          } catch (err) {
            uni.hideLoading();
            uni.showToast({ title: err.message || '转发失败', icon: 'none' });
          }
        }
      });
    },

    // ==================== SOS ====================

    /**
     * B2: 设队长位置为集合点
     * 1. 在队长位置添加固定 ID 'meetup_point' 的 🚩 marker
     * 2. 向车队群发送 type:'system' 系统消息通知队友
     */
    async onSetLeaderMeetup(user) {
      if (!user) return;
      const lat = user.latitude;
      const lng = user.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        uni.showToast({ title: '队长位置无效', icon: 'none' });
        return;
      }
      // 1. 设置集合点 marker 数据
      this.meetupPoint = {
        latitude: lat,
        longitude: lng,
        name: (user.nickname || '队长') + '的集合点'
      };
      // 2. 向车队群发送系统消息
      try {
        await this.chatStore.fetchSessions('team');
        const teamSession = (this.chatStore.sessions || []).find(
          (s) => s.type === 'team_group'
        );
        if (teamSession) {
          await this.chatStore.sendMessage(teamSession.id, {
            type: 'system',
            content: '🚩 ' + (user.nickname || '队长') + '已设集合点，请前往汇合',
            extra: {
              meetup_point: { lng, lat, name: this.meetupPoint.name }
            }
          });
        }
      } catch (err) {
        console.warn('[B2] send meetup system msg failed:', err);
      }
      uni.showToast({ title: '已设为集合点', icon: 'success' });
      this.closeInfoWindow();
    },

    /**
     * B2: 构造集合点 marker(固定 ID 'meetup_point')
     */
    buildMeetupPointMarker() {
      if (!this.meetupPoint) return [];
      const lat = this.meetupPoint.latitude;
      const lng = this.meetupPoint.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return [];
      return [{
        id: -2,  // 固定负数 ID,与正数 markerId 不冲突,微信小程序要求 id 为数字
        latitude: lat,
        longitude: lng,
        iconPath: '/static/default-avatar.png',  // 小程序端 iconPath 必填,用默认图兜底
        width: 1,   // 极小尺寸,视觉上隐藏 icon,只显示 callout
        height: 1,
        label: {
          content: '🚩 ' + (this.meetupPoint.name || '集合点'),
          fontSize: 14,
          color: '#FF8F00',
          anchorX: 0,
          anchorY: -4,
          bgColor: 'rgba(255,248,225,0.95)',
          borderRadius: 8,
          padding: 6,
          borderWidth: 1,
          borderColor: '#FFB300'
        },
        anchor: { x: 0.5, y: 0.5 }
      }];
    },

    /**
     * B6: 导航到最近的加油/充电站
     */
    navigateToNearestFuel() {
      if (!this.fuelAnxiety || !this.fuelAnxiety.nearestPoi) {
        uni.showToast({ title: '暂无附近站点信息', icon: 'none' });
        return;
      }
      const poi = this.fuelAnxiety.nearestPoi;
      uni.openLocation({
        latitude: poi.latitude,
        longitude: poi.longitude,
        name: poi.name || (this.fuelAnxiety.type === 'charge' ? '充电站' : '加油站'),
        address: poi.address || '',
        fail: () => {
          uni.showToast({ title: '打开导航失败', icon: 'none' });
        }
      });
    },


    onSosStart() {
      this.sosHolding = true;
      this.sosTimer = setTimeout(() => {
        if (this.sosHolding) {
          this.sosConfirming = true;
        }
      }, 3000);
    },

    /** 点击 SOS 立即弹出确认框(同时保留长按触发) */
    onSosTap() {
      if (this.sosConfirming) return;
      this.sosConfirming = true;
    },

    onSosEnd() {
      this.sosHolding = false;
      if (this.sosTimer) {
        clearTimeout(this.sosTimer);
        this.sosTimer = null;
      }
    },

    cancelSos() {
      this.sosConfirming = false;
    },

    async confirmSos() {
      this.sosConfirming = false;
      uni.showLoading({ title: '发送中...' });

      try {
        // A8: 修复 SOS 接口 - 走 api 模块的封装,统一 BASE_URL 和鉴权
        if (this.currentLocation) {
          await api.post('/security/sos', {
            lng: this.currentLocation.longitude,
            lat: this.currentLocation.latitude,
            altitude: this.currentAltitude,
            speed: this.currentSpeed,
            timestamp: Date.now()
          }, { showError: false });
        }

        uni.hideLoading();
        uni.showModal({
          title: '已发送紧急求助',
          content: '已向你的紧急联系人和附近救援站发送求助信息。请保持冷静，等待救援。',
          showCancel: false,
          confirmText: '我已知晓'
        });
      } catch (err) {
        uni.hideLoading();
        // 即使后端未实现,SOS 也要给用户正向反馈(本地兜底)
        console.warn('SOS API failed:', err);
        uni.showModal({
          title: '已记录紧急求助',
          content: '已保存你的求助信息。请保持冷静，必要时直接拨打 110/120。',
          showCancel: false,
          confirmText: '我已知晓'
        });
      }
    },

    // ==================== D4: System Notification Safety Alert ====================

    /**
     * D4: 收到高优先级系统通知时,弹出安全提醒 modal
     * 由 App.vue 通过 uni.$emit('system_notification_high', notification) 触发
     */
    showSafetyAlertModal(notification) {
      if (!notification) return;
      // 合并默认值,避免模板渲染 undefined
      this.safetyAlert = {
        title: notification.title || '安全提醒',
        content: notification.content || '',
        priority: notification.priority || 'high',
        type: notification.type || 'system_notification',
        data: notification.data || null,
        timestamp: notification.timestamp || null
      };
    },

    /**
     * D4: 关闭安全提醒 modal
     */
    dismissSafetyAlert() {
      this.safetyAlert = null;
    },

    /**
     * D4: 查看详情 - 跳转通知详情页(若 data.sessionId 存在则进入对应聊天会话,否则仅关闭弹窗)
     */
    viewSafetyDetail() {
      const alert = this.safetyAlert;
      this.safetyAlert = null;
      if (alert && alert.data && alert.data.sessionId) {
        uni.navigateTo({
          url: `/pages/message/chat?sessionId=${alert.data.sessionId}&type=location_room`
        });
      } else if (alert && alert.data && alert.data.url) {
        uni.navigateTo({ url: alert.data.url });
      } else {
        // 无明确跳转目标,引导至消息中心
        uni.switchTab({ url: '/pages/message/index' });
      }
    },

    // ==================== Share Location ====================

    toggleShareLocation() {
      this.shareLocationOn = !this.shareLocationOn;
      uni.showToast({
        title: this.shareLocationOn ? '位置共享已开启' : '位置共享已关闭',
        icon: 'none',
        duration: 1500
      });
    },

    // ==================== Navigation ====================

    goToMessages() {
      uni.switchTab({ url: '/pages/message/index' });
    },

    goToTripDetail() {
      if (this.tripStore.currentTrip) {
        uni.navigateTo({
          url: '/pages/trip/detail?tripId=' + this.tripStore.currentTrip.id
        });
      }
    },

    goToTripCreate() {
      if (!this.userStore.isLoggedIn) {
        uni.navigateTo({ url: '/pages/login/index' });
        return;
      }
      uni.navigateTo({ url: '/pages/trip/create' });
    },

    openIntercom() {
      if (!this.tripStore.hasActiveTrip) {
        uni.showToast({ title: '请先加入一个行程', icon: 'none' });
        return;
      }
      uni.navigateTo({
        url: '/pages/message/chat?type=team&teamId=' + this.tripStore.currentTrip.id
      });
    }
  }
};
</script>

<style lang="scss" scoped>
// ==================== Page Container ====================
.map-page {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

// ==================== Status Bar (Frosted Glass) ====================
.status-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2rpx 12rpx rgba(0, 0, 0, 0.04);
}

/* B6: 燃油/充电焦虑提醒条 */
.fuel-anxiety-bar {
  position: fixed;
  top: 88rpx;
  left: 24rpx;
  right: 24rpx;
  z-index: 99;
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  background: linear-gradient(135deg, #FF6B35, #FF8F00);
  border-radius: 12rpx;
  box-shadow: 0 4rpx 16rpx rgba(255, 107, 53, 0.3);

  .fuel-bar-icon {
    font-size: 32rpx;
    margin-right: 12rpx;
  }

  .fuel-bar-text {
    flex: 1;
    font-size: 26rpx;
    color: #FFFFFF;
    font-weight: 500;
  }

  .fuel-bar-arrow {
    font-size: 36rpx;
    color: #FFFFFF;
  }
}

.status-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 80rpx;
  padding: 0 24rpx;
}

.status-left {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8rpx;
  max-width: 220rpx;
}

.team-name {
  font-size: 28rpx;
  font-weight: 600;
  color: #1A1A1A;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.day-counter {
  font-size: 24rpx;
  font-weight: 500;
  color: #07C160;
  background: rgba(7, 193, 96, 0.1);
  padding: 2rpx 12rpx;
  border-radius: 12rpx;
  flex-shrink: 0;
}

.status-center {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}

.remaining-time {
  font-size: 26rpx;
  color: #666666;
}

.status-right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.status-icon {
  font-size: 24rpx;
}

.status-value {
  font-size: 22rpx;
  color: #1A1A1A;
  font-weight: 500;
}

// ==================== Map ====================
.map-view {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

// ==================== Map Placeholder ====================
.map-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  background: linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 50%, #e0f2f1 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 48rpx;
}

.placeholder-icon {
  font-size: 120rpx;
  opacity: 0.6;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.1);
    opacity: 0.8;
  }
}

.placeholder-title {
  font-size: 36rpx;
  font-weight: 700;
  color: #1a1a1a;
  letter-spacing: 2rpx;
}

.placeholder-desc {
  font-size: 26rpx;
  color: #666;
  letter-spacing: 1rpx;
}

.placeholder-actions {
  display: flex;
  gap: 24rpx;
  margin-top: 16rpx;
}

.placeholder-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  padding: 0 40rpx;
  background: linear-gradient(135deg, #07C160, #05A84E);
  border-radius: 40rpx;
  box-shadow: 0 4rpx 16rpx rgba(7, 193, 96, 0.3);

  text {
    font-size: 28rpx;
    color: #FFFFFF;
    font-weight: 600;
    letter-spacing: 1rpx;
  }

  &:active {
    transform: scale(0.96);
    opacity: 0.9;
  }

  &.secondary {
    background: #FFFFFF;
    color: #07C160;
    border: 2rpx solid #07C160;
    box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.08);

    text {
      color: #07C160;
    }
  }
}

// ==================== 地图 SDK 加载失败提示 ====================
.map-sdk-error {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  background: linear-gradient(135deg, #f0f2f5, #e6e9ee);
  display: flex;
  align-items: center;
  justify-content: center;

  .sdk-error-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16rpx;
    padding: 56rpx 64rpx;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 28rpx;
    box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.08);
    max-width: 560rpx;
    text-align: center;

    .sdk-error-icon {
      font-size: 72rpx;
      opacity: 0.7;
    }

    .sdk-error-title {
      font-size: 32rpx;
      font-weight: 700;
      color: #1A1A1A;
    }

    .sdk-error-desc {
      font-size: 24rpx;
      color: #999;
      line-height: 1.5;
    }

    .sdk-error-btn {
      margin-top: 16rpx;
      padding: 16rpx 56rpx;
      background: linear-gradient(135deg, #07C160, #05A84E);
      border-radius: 40rpx;
      color: #FFFFFF;
      font-size: 26rpx;
      font-weight: 600;

      &:active {
        opacity: 0.85;
      }
    }
  }
}

// ==================== Layer Toggle ====================
.layer-toggle-btn {
  position: fixed;
  top: 200rpx;
  right: 24rpx;
  z-index: 110;
  width: 72rpx;
  height: 72rpx;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.layer-icon {
  font-size: 32rpx;
}

.layer-panel {
  position: fixed;
  top: 200rpx;
  right: 24rpx;
  z-index: 120;
  width: 480rpx;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 8rpx 32rpx rgba(0, 0, 0, 0.15);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}

.layer-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx solid #F0F0F0;
}

.layer-panel-title {
  font-size: 30rpx;
  font-weight: 600;
  color: #1A1A1A;
}

.layer-panel-close {
  font-size: 28rpx;
  color: #999;
  padding: 8rpx;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}

.layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18rpx 0;
  border-bottom: 1rpx solid #F5F5F5;

  &:last-child {
    border-bottom: none;
  }
}

.layer-label {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.layer-name {
  font-size: 28rpx;
  color: #1A1A1A;
  font-weight: 500;
}

.layer-desc {
  font-size: 22rpx;
  color: #999;
  margin-top: 4rpx;
}

// ==================== Bottom Area ====================
.bottom-area {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 0 16rpx 140rpx;
  padding-bottom: calc(140rpx + constant(safe-area-inset-bottom));
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
}

// Trip Card
.trip-card {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-radius: 24rpx;
  padding: 20rpx 28rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 4rpx 20rpx rgba(0, 0, 0, 0.08);
  border: 1rpx solid rgba(0, 0, 0, 0.06);
}

.trip-card.no-trip {
  .trip-card-row {
    justify-content: center;
  }
}

.trip-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.trip-card-left {
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.trip-level {
  font-size: 22rpx;
  font-weight: 700;
  color: #07C160;
  background: rgba(7, 193, 96, 0.1);
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  flex-shrink: 0;
}

.trip-name {
  font-size: 26rpx;
  font-weight: 600;
  color: #1A1A1A;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trip-distance {
  font-size: 22rpx;
  color: #666;
  flex-shrink: 0;
}

.no-trip-text {
  font-size: 26rpx;
  color: #666;
}

.no-trip-arrow {
  font-size: 32rpx;
  color: #999;
  margin-left: 8rpx;
}

.trip-card-actions {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
  margin-left: 16rpx;
}

.trip-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 64rpx;
  padding: 0 16rpx;
  background: #F5F5F5;
  border-radius: 16rpx;
  font-size: 20rpx;
  color: #1A1A1A;

  &.intercom {
    background: rgba(7, 193, 96, 0.1);
    color: #07C160;
  }
}

.trip-action-status {
  font-size: 18rpx;
  font-weight: 600;

  &.on {
    color: #07C160;
  }

  &:not(.on) {
    color: #999;
  }
}

// Bottom Action Buttons
.bottom-actions {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
}

.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100rpx;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 24rpx;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  border: 1rpx solid rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;

  &:active {
    transform: scale(0.96);
    opacity: 0.85;
  }

  &.primary {
    background: linear-gradient(135deg, #07C160, #05A84E);
    border: none;
    color: #FFFFFF;

    .action-btn-icon {
      filter: brightness(1.2);
    }

    .action-btn-text {
      color: #FFFFFF;
    }
  }

  &.sos {
    background: linear-gradient(135deg, #FFF0ED, #FFE8E4);
    border: 2rpx solid #E74C3C;

    .action-btn-text {
      color: #E74C3C;
      font-weight: 700;
    }
  }
}

.action-btn-icon {
  width: 56rpx;
  height: 56rpx;
  margin-bottom: 0;
  flex-shrink: 0;
}

.action-btn-text {
  font-size: 22rpx;
  color: #1A1A1A;
  font-weight: 500;
}

// ==================== SOS Dialog ====================
.sos-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.sos-dialog {
  width: 560rpx;
  background: #FFFFFF;
  border-radius: 32rpx;
  padding: 48rpx 40rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.2);
  animation: scaleIn 0.25s ease;
}

.sos-dialog-icon {
  font-size: 80rpx;
  margin-bottom: 20rpx;
}

.sos-dialog-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #E74C3C;
  margin-bottom: 12rpx;
}

.sos-dialog-desc {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  line-height: 1.6;
  margin-bottom: 32rpx;
}

.sos-dialog-actions {
  display: flex;
  width: 100%;
  gap: 20rpx;
}

.sos-dialog-btn {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 600;

  &.cancel {
    background: #F5F5F5;
    color: #666;
  }

  &.confirm {
    background: linear-gradient(135deg, #E74C3C, #C0392B);
    color: #FFFFFF;
  }
}

// ==================== D4: System Safety Alert Modal ====================
.safety-alert-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1001; // 高于 SOS overlay(1000),确保系统提醒优先可见
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

.safety-alert-modal {
  width: 580rpx;
  background: #FFFFFF;
  border-radius: 32rpx;
  padding: 48rpx 40rpx 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.2);
  animation: scaleIn 0.25s ease;
}

.safety-alert-icon {
  font-size: 88rpx;
  margin-bottom: 20rpx;
  // 轻微抖动动画强调警示性
  animation: alertShake 0.5s ease-in-out 2;
}

.safety-alert-title {
  font-size: 34rpx;
  font-weight: 700;
  color: #FF6B35; // 警告色
  margin-bottom: 14rpx;
  text-align: center;
}

.safety-alert-desc {
  font-size: 26rpx;
  color: #666;
  text-align: center;
  line-height: 1.6;
  margin-bottom: 36rpx;
  word-break: break-all;
}

.safety-alert-actions {
  display: flex;
  width: 100%;
  gap: 20rpx;
}

.safety-btn {
  flex: 1;
  height: 80rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 600;

  &.ignore {
    background: #F5F5F5;
    color: #666;
  }

  &.detail {
    background: linear-gradient(135deg, #FF6B35, #E55A2B);
    color: #FFFFFF;
  }
}

@keyframes alertShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-8rpx); }
  75% { transform: translateX(8rpx); }
}

// ==================== Animations ====================
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
