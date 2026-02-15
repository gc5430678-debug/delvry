import React, { useEffect, useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

const COLORS = {
  bg: '#0f0f2',
  card: '#1a1a2e',
  accent: '#00E5FF',
  accentDim: 'rgba(0, 229, 255, 0.15)',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  success: '#10b981',
  successDim: 'rgba(16, 185, 129, 0.15)',
  warning: '#f59e0b',
  warningDim: 'rgba(245, 158, 11, 0.15)',
};

const API = 'https://back-end-nodejs-production-fdc5.up.railway.app/api';

export default function ExploreScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [delverName, setDelverName] = useState('');
  const [delverEmail, setDelverEmail] = useState('');
  const [location, setLocation] = useState<{ latitude: number | null; longitude: number | null }>({
    latitude: null,
    longitude: null,
  });
  const [clientsLocations, setClientsLocations] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [summariesModal, setSummariesModal] = useState(false);
  const [summaries, setSummaries] = useState<any[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const locationInterval = useRef<any>(null);
  const locationWarned = useRef(false);

  useEffect(() => {
    getDelverData().then(() => {
      fetchOrders();
      fetchAllClientsLocations();
    });
    const interval = setInterval(() => {
      fetchOrders();
      fetchAllClientsLocations();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      locationInterval.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const newLocation = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setLocation(newLocation);
          if (delverEmail) {
            await axios.post(`${API}/delver/update-location`, {
              email: delverEmail,
              latitude: newLocation.latitude,
              longitude: newLocation.longitude,
            });
          }
        } catch {
          if (!locationWarned.current) {
            locationWarned.current = true;
          }
        }
      }, 3000);
    };
    updateLocation();
    return () =>
      locationInterval.current && clearInterval(locationInterval.current);
  }, [delverEmail]);

  const getDelverData = async () => {
    const name = await AsyncStorage.getItem('name');
    const email = await AsyncStorage.getItem('email');
    setDelverName(name || 'مندوب');
    setDelverEmail(email || '');
  };

  const fetchOrders = async () => {
    try {
      const email = await AsyncStorage.getItem('email');
      if (!email) return;
      const res = await axios.get(`${API}/delver/all`);
      const newOrders: any[] = [];
      res.data.users.forEach((user: any) => {
        const products = Array.isArray(user.products)
          ? user.products.filter((p: any) => p.delverEmail === email)
          : [];
        const clientGroups: Record<string, any[]> = {};
        products.forEach((p: any) => {
          const key = `${p.clientName}-${p.clientPhone}`;
          if (!clientGroups[key]) clientGroups[key] = [];
          clientGroups[key].push(p);
        });
        Object.keys(clientGroups).forEach(key => {
          const items = clientGroups[key];
          newOrders.push({
            id: key,
            clientName: items[0].clientName,
            clientPhone: items[0].clientPhone,
            items,
            totalPrice: items.reduce((s: number, i: any) => s + i.price * i.quantity, 0),
            accepted: items[0].accepted || false,
            delivered: items[0].delivered || false,
            email,
          });
        });
      });
      setOrders(prev => {
        const merged = [...prev];
        newOrders.forEach(newOrder => {
          const index = merged.findIndex(o => o.id === newOrder.id);
          if (index !== -1) {
            merged[index] = {
              ...merged[index],
              ...newOrder,
              accepted: merged[index].accepted || newOrder.accepted,
              delivered: merged[index].delivered || newOrder.delivered,
            };
          } else {
            merged.push(newOrder);
          }
        });
        return merged;
      });
    } catch (err) {
      console.log('خطأ في جلب الطلبات:', (err as Error).message);
    }
  };

  const fetchAllClientsLocations = async () => {
    try {
      const res = await axios.get(`${API}/user/all-locations`);
      if (res.data.users) {
        const locations = res.data.users
          .filter((u: any) => u.location)
          .map((u: any) => ({
            name: u.name,
            email: u.email,
            phone: u.phone,
            location: u.location,
          }));
        setClientsLocations(locations);
      }
    } catch {
      // ignore
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchOrders(), fetchAllClientsLocations()]);
    setRefreshing(false);
  };

  const openGoogleMaps = (clientName: string) => {
    const client = clientsLocations.find(c => c.name === clientName);
    if (!client?.location) {
      Alert.alert('⚠️ لا يوجد موقع مسجل لهذا الزبون');
      return;
    }
    Linking.openURL(`https://www.google.com/maps?q=${client.location}`);
  };

  const callClient = (phone: string) => {
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const acceptOrder = async (order: any) => {
    try {
      if (!order.accepted) {
        await axios.post(`${API}/delver/accept-order`, {
          clientName: order.clientName,
          clientPhone: order.clientPhone,
          email: order.email,
          delverName,
          delverEmail,
          latitude: location.latitude,
          longitude: location.longitude,
        });
        // حفظ معلومات الطلب عند القبول
        const zone = order.items?.[0]?.clientArea || order.items?.[0]?.clientLocation || '';
        await axios.post(`${API}/delver/save-order-summary`, {
          delverEmail,
          delverName,
          clientName: order.clientName,
          clientPhone: order.clientPhone,
          zone,
          items: order.items || [],
          totalPrice: order.totalPrice || 0,
        });
        Alert.alert('✅ تم قبول الطلب');
      }
      setOrders(prev =>
        prev.map(o => (o.id === order.id ? { ...o, accepted: true } : o))
      );
    } catch {
      Alert.alert('❌ فشل العملية');
    }
  };

  const deliverOrder = async (order: any) => {
    if (!order.accepted) {
      Alert.alert('⚠️ يجب قبول الطلب أولاً قبل التسليم');
      return;
    }
    try {
      const res = await axios.post(`${API}/delver/order-delivered`, {
        clientName: order.clientName,
        clientPhone: order.clientPhone,
        delverEmail,
      });
      if (res.data.success) {
        setOrders(prev => prev.filter(o => o.id !== order.id));
        Alert.alert('✅ تم التسليم', 'تم حذف الطلب من النظام.');
      } else {
        Alert.alert('❌', res.data.message || 'فشل تنفيذ العملية');
      }
    } catch {
      Alert.alert('❌', 'فشل الاتصال بالسيرفر');
    }
  };

  const openSummariesModal = async () => {
    try {
      const params: any = {};
      if (delverEmail) params.delverEmail = delverEmail;
      const res = await axios.get(`${API}/delver/order-summaries`, { params });
      if (res.data.success) {
        setSummaries(res.data.summaries || []);
        setGrandTotal(res.data.grandTotal || 0);
        setSummariesModal(true);
      } else {
        setSummaries([]);
        setGrandTotal(0);
        setSummariesModal(true);
      }
    } catch {
      setSummaries([]);
      setGrandTotal(0);
      setSummariesModal(true);
    }
  };

  return (
    <View style={styles.screen}>
      {/* زر منفصل ثابت — ملخص الطلبات */}
      <View style={styles.summariesBtnWrap}>
        <Pressable
          style={({ pressed }) => [
            styles.summariesBtn,
            pressed && styles.actionBtnPressed,
          ]}
          onPress={openSummariesModal}
        >
          <Ionicons name="stats-chart-outline" size={24} color="#fff" />
          <Text style={styles.summariesBtnText}>ملخص الطلبات المسلّمة</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.accent}
          />
        }
      >
        <View style={styles.headerCard}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="cube-outline" size={28} color={COLORS.accent} />
          </View>
          <Text style={styles.headerTitle}>الطلبات</Text>
          <Text style={styles.headerSub}>
            {orders.length === 0
              ? 'لا توجد طلبات جديدة'
              : `${orders.length} طلب — اسحب للتحديث`}
          </Text>
        </View>

        {orders.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="document-text-outline" size={48} color={COLORS.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>لا يوجد طلبات</Text>
            <Text style={styles.emptySub}>ستظهر الطلبات هنا عند وصولها</Text>
          </View>
        )}

        {orders.map(order => (
          <View key={order.id} style={styles.orderCard}>
            <View style={styles.orderCardHeader}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarText}>
                  {(order.clientName || '؟').charAt(0)}
                </Text>
              </View>
              <View style={styles.orderCardHeaderText}>
                <Text style={styles.clientName}>{order.clientName}</Text>
                <View style={styles.statusChipWrap}>
                  {order.delivered ? (
                    <View style={[styles.statusChip, styles.statusDelivered]}>
                      <Ionicons name="checkmark-done" size={14} color={COLORS.success} />
                      <Text style={[styles.statusChipText, { color: COLORS.success }]}>تم التسليم</Text>
                    </View>
                  ) : order.accepted ? (
                    <View style={[styles.statusChip, styles.statusAccepted]}>
                      <Ionicons name="bicycle" size={14} color={COLORS.accent} />
                      <Text style={[styles.statusChipText, { color: COLORS.accent }]}>قيد التوصيل</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusChip, styles.statusPending]}>
                      <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                      <Text style={[styles.statusChipText, { color: COLORS.warning }]}>بانتظار القبول</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.totalBadge}>
                <Text style={styles.totalBadgeText}>
                  {(order.totalPrice ?? 0).toLocaleString()}
                </Text>
                <Text style={styles.totalBadgeUnit}>د.ع</Text>
              </View>
            </View>

            <View style={styles.orderCardBody}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnMap,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => openGoogleMaps(order.clientName)}
              >
                <Ionicons name="location" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>الموقع</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnCall,
                  pressed && styles.actionBtnPressed,
                ]}
                onPress={() => callClient(order.clientPhone)}
              >
                <Ionicons name="call" size={20} color="#fff" />
                <Text style={styles.actionBtnText}>اتصال</Text>
              </Pressable>
            </View>

            {!order.accepted ? (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                ]}
                onPress={() => acceptOrder(order)}
              >
                <Ionicons name="checkmark-circle-outline" size={22} color="#0f0f23" />
                <Text style={styles.primaryBtnText}>قبول الطلب</Text>
              </Pressable>
            ) : !order.delivered ? (
              <Pressable
                style={({ pressed }) => [
                  styles.deliverBtn,
                  pressed && styles.deliverBtnPressed,
                ]}
                onPress={() => deliverOrder(order)}
              >
                <Ionicons name="bicycle" size={22} color="#fff" />
                <Text style={styles.deliverBtnText}>تم التسليم</Text>
              </Pressable>
            ) : (
              <View style={styles.doneRow}>
                <Ionicons name="checkmark-done-circle" size={24} color={COLORS.success} />
                <Text style={styles.doneRowText}>تم تسليم الطلب</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Modal
        visible={summariesModal}
        animationType="slide"
        transparent
        onRequestClose={() => setSummariesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ملخص الطلبات المسلّمة</Text>
              <Pressable onPress={() => setSummariesModal(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={28} color={COLORS.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {summaries.length === 0 ? (
                <Text style={styles.modalEmpty}>لا توجد طلبات مسلّمة محفوظة</Text>
              ) : (
                summaries.map((s: any, i: number) => (
                  <View key={s._id || i} style={styles.summaryCard}>
                    <Text style={styles.summaryClientName}>{s.clientName}</Text>
                    <Text style={styles.summaryProductsCount}>
                      عدد المنتجات: {(s.items || []).length}
                    </Text>
                    {(s.items || []).map((it: any, j: number) => (
                      <View key={j} style={styles.summaryItemRow}>
                        <Text style={styles.summaryItemText}>
                          {it.name} — {it.quantity} × {(it.price || 0).toLocaleString()} = {(it.subtotal || 0).toLocaleString()} د.ع
                        </Text>
                      </View>
                    ))}
                    <View style={styles.summaryTotalRow}>
                      <Text style={styles.summaryTotalLabel}>سعر كلي للزبون:</Text>
                      <Text style={styles.summaryTotalValue}>
                        {(s.totalPrice || 0).toLocaleString()} د.ع
                      </Text>
                    </View>
                  </View>
                ))
              )}
              {summaries.length > 0 && (
                <View style={styles.grandTotalCard}>
                  <Text style={styles.grandTotalLabel}>مجموع أسعار الكل</Text>
                  <Text style={styles.grandTotalValue}>{grandTotal.toLocaleString()} د.ع</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  summariesBtnWrap: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    backgroundColor: COLORS.bg,
  },
  headerCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.12)',
  },
  headerIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  orderCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.accent,
  },
  orderCardHeaderText: {
    flex: 1,
  },
  clientName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 6,
  },
  statusChipWrap: {
    flexDirection: 'row',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 4,
  },
  statusPending: {
    backgroundColor: COLORS.warningDim,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusAccepted: {
    backgroundColor: COLORS.accentDim,
  },
  statusDelivered: {
    backgroundColor: COLORS.successDim,
  },
  totalBadge: {
    backgroundColor: COLORS.accentDim,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: 'flex-end',
  },
  totalBadgeText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.accent,
  },
  totalBadgeUnit: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  orderCardBody: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  summariesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 10,
  },
  summariesBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalScroll: {
    padding: 20,
    maxHeight: 500,
  },
  modalEmpty: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 40,
  },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  summaryClientName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  summaryProductsCount: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  summaryItemRow: {
    marginBottom: 4,
  },
  summaryItemText: {
    fontSize: 13,
    color: COLORS.text,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.accent,
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.accent,
  },
  grandTotalCard: {
    backgroundColor: COLORS.accentDim,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
    alignItems: 'center',
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  grandTotalValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.accent,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
  },
  actionBtnPressed: {
    opacity: 0.85,
  },
  actionBtnMap: {
    backgroundColor: '#3b82f6',
  },
  actionBtnCall: {
    backgroundColor: COLORS.success,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryBtnPressed: {
    opacity: 0.9,
  },
  primaryBtnText: {
    color: '#0f0f23',
    fontSize: 16,
    fontWeight: '800',
  },
  deliverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  deliverBtnPressed: {
    opacity: 0.9,
  },
  deliverBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  doneRowText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.success,
  },
});
