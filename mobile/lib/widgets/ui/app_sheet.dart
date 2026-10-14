import 'package:flutter/material.dart';

/// How many bottom sheets are open right now. The floating navigation bar reads
/// this and slides out of the way, so it never sits on top of a sheet's buttons.
final ValueNotifier<int> openSheets = ValueNotifier<int>(0);

/// [showModalBottomSheet] that also tells the navigation bar to slide away for
/// as long as the sheet is open (and back when it closes, however it closes), and
/// lifts the sheet's content clear of the phone's own bottom bar (the 3-button
/// navigation or gesture strip) so its last button is never underneath it.
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
      builder: (ctx) => Padding(
        // Only the part of the bottom inset not already taken by the keyboard.
        padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(ctx).bottom),
        // The space is added here, so a sheet's own SafeArea must not add it again.
        child: MediaQuery.removePadding(context: ctx, removeBottom: true, child: builder(ctx)),
      ),
    );
  } finally {
    openSheets.value--;
  }
}
