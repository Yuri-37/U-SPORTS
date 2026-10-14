import 'package:flutter/material.dart';

/// How many bottom sheets are open right now. The floating navigation bar reads
/// this and slides out of the way, so it never sits on top of a sheet's buttons.
final ValueNotifier<int> openSheets = ValueNotifier<int>(0);

/// [showModalBottomSheet] that also tells the navigation bar to slide away for
/// as long as the sheet is open (and back when it closes, however it closes).
Future<T?> showAppSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool isScrollControlled = false,
}) async {
  openSheets.value++;
  try {
    return await showModalBottomSheet<T>(
      context: context,
      isScrollControlled: isScrollControlled,
      builder: builder,
    );
  } finally {
    openSheets.value--;
  }
}
