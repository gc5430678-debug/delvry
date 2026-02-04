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
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); // تحديث الطلبات كل 5 ثواني
    return () => clearInterval(interval);
  }, []);

  // ================= تحديث الموقع تلقائي =================
  useEffect(() => {
    const updateLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      locationInterval.current = setInterval(async () => {
        const loc = await Location.getCurrentPositionAsync({});
        const newLocation = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setLocation(newLocation);

        // إرسال الموقع للسيرفر
        if (delverEmail) {
          try {
            await axios.post('https://back-end-nodejs-production-d9de.up.railway.app/api/delver/update-location', {
              email: delverEmail,
              latitude: newLocation.latitude,
              longitude: newLocation.longitude
            });
          } catch (err) {
            console.log('خطأ في تحديث الموقع:', err.message);
          }
        }
      }, 5000); // كل 5 ثواني
    };

    updateLocation();

    return () => {
      if (locationInterval.current) clearInterval(locationInterval.current);
    };
  }, [delverEmail]);

  // ================= جلب الطلبات =================
  const fetchOrders = async () => {
    try {
      const res = await axios.get(
        "https://back-end-nodejs-production-d9de.up.railway.app/api/delver/all"
      );

      const allOrders = [];
      res.data.users.forEach(user => {
        const products = Array.isArray(user.products) ? user.products : [];
        const clientGroups = {};

        products.forEach(p => {
          const key = `${p.clientName}-${p.clientPhone}`;
          if (!clientGroups[key]) clientGroups[key] = [];
          clientGroups[key].push(p);
        });

        Object.keys(clientGroups).forEach(key => {
          const clientProducts = clientGroups[key];
          allOrders.push({
            id: key,
            clientName: clientProducts[0].clientName,
            clientPhone: clientProducts[0].clientPhone,
            clientLocation: clientProducts[0].clientLocation,
            items: clientProducts,
            totalPrice: clientProducts.reduce((sum, i) => sum + i.price * i.quantity, 0),
            accepted: clientProducts[0].accepted || false,
            email: user.email
          });
        });
      });

      setOrders(allOrders);
    } catch (err) {
      console.log("خطأ في جلب الطلبات:", err.message);
    }
  };

  // ================= فتح الموقع =================
  const openGoogleMaps = (location) => {
    if (!location) return;
    const url = `https://www.google.com/maps?q=${location}`;
    Linking.openURL(url);
  };

  // ================= اتصال =================
  const callClient = (phone) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  };

  // ================= الحصول على بيانات المندوب =================
  const getDelverData = async () => {
    const name = await AsyncStorage.getItem('name');
    const email = await AsyncStorage.getItem('email');
    setDelverName(name || 'مندوب');
    setDelverEmail(email || 'no-email@example.com');
  };

  // ================= قبول الطلب =================
  const acceptOrder = async (order) => {
    try {
      await getDelverData();

      // إرسال البيانات للسيرفر مع الموقع الحالي
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

      // تحديث حالة الطلب في الواجهة مباشرة
      setOrders(prev =>
        prev.map(o =>
          o.id === order.id ? { ...o, accepted: true } : o
        )
      );
    } catch (err) {
      console.error(err);
      Alert.alert("❌ فشل قبول الطلب");
    }
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
            order.accepted ? { backgroundColor: '#d4fcd4' } : null
          ]}
        >
          {/* بيانات العميل */}
          <TouchableOpacity onPress={() =>
            setExpandedClientId(expandedClientId === order.id ? null : order.id)
          }>
            <Text style={{ fontWeight: 'bold', fontSize: 16 }}>👤 {order.clientName}</Text>
            <Text>📞 {order.clientPhone}</Text>
            <Text>📍 {order.clientLocation}</Text>
            <Text>💰 المجموع: {order.totalPrice} IQD</Text>
          </TouchableOpacity>

          {/* زر الموقع */}
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => openGoogleMaps(order.clientLocation)}
          >
            <Text style={styles.mapButtonText}>📍 افتح الموقع</Text>
          </TouchableOpacity>

          {/* زر الاتصال */}
          <TouchableOpacity
            style={styles.callButton}
            onPress={() => callClient(order.clientPhone)}
          >
            <Text style={styles.callButtonText}>📞 اتصال بالعميل</Text>
          </TouchableOpacity>

          {/* زر قبول الطلب / تم القبول */}
          {!order.accepted ? (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => acceptOrder(order)}
            >
              <Text style={styles.doneButtonText}>✅ قبول الطلب</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.doneButton, { backgroundColor: '#34d399' }]}>
              <Text style={styles.doneButtonText}>
                ✅ تم قبول الطلب
              </Text>
            </View>
          )}

          {/* المنتجات */}
          {expandedClientId === order.id && order.items.length > 0 && (
            <View style={{ marginTop: 10 }}>
              {order.items.map((item, index) => (
                <View key={item.title + index} style={styles.productCard}>
                  <Image
                    source={{ uri: `https://categories-relationship-plaintiff-engineers.trycloudflare.com${item.image}` }}
                    style={{ height: 120, marginBottom: 5 }}
                  />
                  <Text>{item.title}</Text>
                  <Text>الكمية: {item.quantity}</Text>
                  <Text>السعر: {item.price} IQD</Text>
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

  mapButton: {
    backgroundColor: '#1e90ff',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center'
  },
  mapButtonText: { color: '#fff', fontWeight: 'bold' },

  callButton: {
    backgroundColor: '#28a745',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center'
  },
  callButtonText: { color: '#fff', fontWeight: 'bold' },

  doneButton: {
    backgroundColor: '#ff9800',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center'
  },
  doneButtonText: {
    color: '#fff',
    fontWeight: 'bold'
  }
});
