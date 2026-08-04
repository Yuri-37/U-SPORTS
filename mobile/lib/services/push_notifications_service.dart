import 'dart:convert';
import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api_service.dart';
import 'router.dart';

const _channel = AndroidNotificationChannel(
  'high_importance_channel',
  'Alerts',
  description: 'Announcements, match updates, and other U-Sports alerts.',
  importance: Importance.high,
);

final _localNotifications = FlutterLocalNotificationsPlugin();

/// Runs in a separate isolate when a message arrives while the app is
/// backgrounded/terminated. Must stay top-level (FCM plugin requirement).
/// The OS already renders the notification natively in this state from the
/// FCM payload's `notification` block — nothing to do here today, this is
/// just the required hook point for future background data-processing.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {}

/// Requests permission, registers this device's FCM token with the server,
/// and shows a local notification for messages that arrive in the
/// foreground (FCM doesn't auto-display those the way it does in
/// background/terminated state).
class PushNotificationsService {
  PushNotificationsService(this._ref);
  final Ref _ref;

  Future<void> init() async {
    if (kIsWeb) return; // Web push needs a separate VAPID/service-worker setup.

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission(alert: true, badge: true, sound: true);
    await _initLocalNotifications();

    FirebaseMessaging.onMessage.listen(_showLocalNotification);

    // Tapped while backgrounded (app process still alive).
    FirebaseMessaging.onMessageOpenedApp
        .listen((m) => _navigateForMessageData(m.data));

    // Cold start from terminated via a notification tap. init() runs from
    // initState(), before the first frame, so rootNavigatorKey.currentContext
    // isn't attached yet — defer the actual navigation past the first frame.
    final initial = await messaging.getInitialMessage();
    if (initial != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _navigateForMessageData(initial.data);
      });
    }

    // Re-sync whenever auth state changes (covers already-signed-in at
    // startup, a fresh sign-in, and sign-out leaving no active session to
    // register against) and whenever FCM rotates the token underneath us.
    Supabase.instance.client.auth.onAuthStateChange.listen((_) => _syncToken());
    messaging.onTokenRefresh.listen((_) => _syncToken());
    await _syncToken();
  }

  Future<void> _initLocalNotifications() async {
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
      // Tapped while foregrounded/backgrounded-but-alive — local notifications
      // are only ever shown via onMessage while the process is running, so
      // this always fires on the main isolate (no background entry point needed).
      onDidReceiveNotificationResponse: _onLocalNotificationTapped,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);
  }

  void _showLocalNotification(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;
    _localNotifications.show(
      notification.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: jsonEncode(message.data),
    );
  }

  void _onLocalNotificationTapped(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null || payload.isEmpty) return;
    try {
      _navigateForMessageData(
          Map<String, dynamic>.from(jsonDecode(payload) as Map));
    } catch (e) {
      debugPrint('[push] bad notification payload: $e');
    }
  }

  /// Foreground pushes deliberately don't call this — only a tap does. Don't
  /// yank the user away from what they're doing on an incoming push; just
  /// show the local notification and let them tap through when ready.
  void _navigateForMessageData(Map<String, dynamic> data) {
    final type = data['type'] as String? ?? '';
    String path = '/notifications';
    if (type.startsWith('announcement_')) {
      path = '/notifications';
    } else if (type == 'team_added_to_event' && data['event_id'] != null) {
      path = '/events/${data['event_id']}';
    } else if ((type == 'added_to_team' || type == 'lineup_updated') &&
        data['team_id'] != null) {
      path = '/teams/${data['team_id']}';
    }
    rootNavigatorKey.currentContext?.go(path);
  }

  Future<void> _syncToken() async {
    final session = Supabase.instance.client.auth.currentSession;
    if (session == null) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _ref.read(apiClientProvider).postJson(
        '/notifications/push-token',
        body: {'token': token, 'platform': Platform.isIOS ? 'ios' : 'android'},
      );
    } catch (e) {
      debugPrint('[push] token sync failed: $e');
    }
  }

  /// Called before sign-out so a shared/reset device stops receiving the
  /// previous user's pushes. Must run while the session is still valid — the
  /// route is auth-gated.
  Future<void> unregisterToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await _ref.read(apiClientProvider).deleteJson(
        '/notifications/push-token',
        body: {'token': token},
      );
    } catch (e) {
      debugPrint('[push] token unregister failed: $e');
    }
  }
}

final pushNotificationsServiceProvider =
    Provider<PushNotificationsService>((ref) {
  return PushNotificationsService(ref);
});
