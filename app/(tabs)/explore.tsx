import React, { useEffect, useState, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export default function App() {
  const [orders, setOrders] = useState([]);
  const [expandedClientId, setExpandedClientId] = useState(null);
  const [delverName, setDelverName] = useState('');
  const [delverEmail, setDelverEmail] = useState('');
  const [location, setLocation] = useState({ latitude: null, longitude: null });

  const locationInterval = useRef(null);

  useEffect(() => {
    getDelverData().then(fetchOrders);
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  // ================= تحديث الموقع =================
  useEffect(() => {
    const updateLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationInterval.current = setInterval(async () => {
        const loc = await Location.getCurrentPositionAsync({});
        const newLocation = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setLocation(newLocation);

        if (delverEmail) {
          await axios.post(
            'https://back-end-nodejs-production-d9de.up.railway.app/api/delver/update-location',
            {
              email: delverEmail,
              latitude: newLocation.latitude,
              longitude: newLocation.longitude
            }
          );
        }
      }, 3000);
    };

    updateLocation();
    return () => locationInterval.current && clearInterval(locationInterval.current);
  }, [delverEmail]);

  // ================= بيانات المندوب =================
  const getDelverData = async () => {
    const name = await AsyncStorage.getItem('name');
    const email = await AsyncStorage.getItem('email');
    setDelverName(name || 'مندوب');
    setDelverEmail(email || '');
  };

  // ================= جلب الطلبات =================
  const fetchOrders = async () => {
    try {
      const email = await AsyncStorage.getItem('email');
      if (!email) return;

      const res = await axios.get(
        "https://back-end-nodejs-production-d9de.up.railway.app/api/delver/all"
      );

      const allOrders = [];
      res.data.users.forEach(user => {
        const products = Array.isArray(user.products)
          ? user.products.filter(p => p.delverEmail === email)
          : [];

        const clientGroups = {};
        products.forEach(p => {
          const key = `${p.clientName}-${p.clientPhone}`;
          if (!clientGroups[key]) clientGroups[key] = [];
          clientGroups[key].push(p);
        });

        Object.keys(clientGroups).forEach(key => {
          const items = clientGroups[key];
          allOrders.push({
            id: key,
            clientName: items[0].clientName,
            clientPhone: items[0].clientPhone,
            clientLocation: items[0].clientLocation,
            items,
            totalPrice: items.reduce((s, i) => s + i.price * i.quantity, 0),
            accepted: items[0].accepted || false,
            delivered: items[0].delivered || false,
            email
          });
        });
      });

      setOrders(allOrders);
    } catch (err) {
      console.log("خطأ في جلب الطلبات:", err.message);
    }
  };

  const openGoogleMaps = (location) => {
    if (!location) return;
    Linking.openURL(`https://www.google.com/maps?q=${location}`);
  };

  const callClient = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  // ================= قبول الطلب =================
  const acceptOrder = async (order) => {
    try {
      if (!order.accepted) {
        await axios.post(
          'https://back-end-nodejs-production-d9de.up.railway.app/api/delver/accept-order',
          {
            clientName: order.clientName,
            clientPhone: order.clientPhone,
            email: order.email,
            delverName,
            delverEmail,
            latitude: location.latitude,
            longitude: location.longitude
          }
        );
        Alert.alert("✅ تم قبول الطلب");
      }

      setOrders(prev =>
        prev.map(o =>
          o.id === order.id ? { ...o, accepted: true } : o
        )
      );
    } catch {
      Alert.alert("❌ فشل العملية");
    }
  };

  // ================= تسليم الطلب =================
  const deliverOrder = (order) => {
    if (!order.accepted) {
      Alert.alert("⚠️ يجب قبول الطلب أولاً قبل التسليم");
      return;
    }

    setOrders(prev =>
      prev.map(o =>
        o.id === order.id ? { ...o, delivered: true } : o
      )
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 50 }}>
      <Text style={styles.header}>📲 تطبيق المندوب</Text>

      {orders.length === 0 && <Text>لا يوجد طلبات</Text>}

      {orders.map(order => (
        <View
          key={order.id}
          style={[
            styles.clientCard,
            order.accepted && { backgroundColor: '#d1fae5' }
          ]}
        >
          <TouchableOpacity onPress={() =>
            setExpandedClientId(expandedClientId === order.id ? null : order.id)
          }>
            <Text style={{ fontWeight: 'bold' }}>👤 {order.clientName}</Text>
            <Text>📞 {order.clientPhone}</Text>
            <Text>📍 {order.clientLocation}</Text>
            <Text>💰 {order.totalPrice} IQD</Text>
          </TouchableOpacity>

          {/* زر الموقع */}
          <TouchableOpacity style={styles.mapButton} onPress={() => openGoogleMaps(order.clientLocation)}>
            <Text style={styles.mapButtonText}>📍 الموقع</Text>
          </TouchableOpacity>

          {/* زر الاتصال */}
          <TouchableOpacity style={styles.callButton} onPress={() => callClient(order.clientPhone)}>
            <Text style={styles.callButtonText}>📞 اتصال</Text>
          </TouchableOpacity>

          {/* زر قبول الطلب */}
          <TouchableOpacity
            style={[styles.doneButton, order.accepted && { backgroundColor: '#22c55e' }]}
            onPress={() => acceptOrder(order)}
          >
            <Text style={styles.doneButtonText}>
              {order.accepted ? "✅ تم قبول الطلب" : "📦 قبول الطلب"}
            </Text>
          </TouchableOpacity>

          {/* زر تم تسليم الطلب */}
          <TouchableOpacity
            style={[
              styles.deliverButton,
              order.delivered && styles.delivered,
              !order.accepted && { opacity: 0.5 } // غير مفعل إذا لم يتم القبول
            ]}
            disabled={!order.accepted}
            onPress={() => deliverOrder(order)}
          >
            <Text style={[styles.deliverText, order.delivered && { color: 'red' }]}>
              🚚 تم تسليم الطلب
            </Text>
          </TouchableOpacity>

          {/* عرض المنتجات */}
          {expandedClientId === order.id && (
            <View>
              {order.items.map((item, i) => (
                <View key={i} style={styles.productCard}>
                  <Image
                    source={{ uri: `https://categories-relationship-plaintiff-engineers.trycloudflare.com${item.image}` }}
                    style={{ height: 120 }}
                  />
                  <Text>{item.title}</Text>
                  <Text>الكمية: {item.quantity}</Text>
                  <Text>السعر: {item.price}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  clientCard: { backgroundColor: '#ddd', padding: 15, borderRadius: 10, marginBottom: 15 },
  productCard: { backgroundColor: '#eee', padding: 15, borderRadius: 10, marginBottom: 10 },
  mapButton: { backgroundColor: '#1e90ff', padding: 10, borderRadius: 8, marginTop: 8 },
  mapButtonText: { color: '#fff' },
  callButton: { backgroundColor: '#28a745', padding: 10, borderRadius: 8, marginTop: 8 },
  callButtonText: { color: '#fff' },
  doneButton: { backgroundColor: '#ff9800', padding: 12, borderRadius: 8, marginTop: 8 },
  doneButtonText: { color: '#fff', fontWeight: 'bold' },
  deliverButton: {
    borderWidth: 2,
    borderColor: 'red',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    backgroundColor: 'transparent'
  },
  delivered: { opacity: 0.4 },
  deliverText: { fontWeight: 'bold', textAlign: 'center' }
});
