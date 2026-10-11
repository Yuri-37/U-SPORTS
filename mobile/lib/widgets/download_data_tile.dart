import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../services/api_service.dart';
import '../utils/feedback.dart';
import 'ui/brand_page.dart';

/// The file name of a personal-data export, e.g. `u-sports-my-data-2026-10-11.json`.
/// Same name the website's "Download my data" gives its file.
String myDataFileName(DateTime now) {
  final d = now.toIso8601String().substring(0, 10);
  return 'u-sports-my-data-$d.json';
}

/// "Download my data" (Data Privacy Act, right to a copy). Fetches the same JSON
/// the website offers from `GET /profile/export`, saves it to a temporary file
/// and opens the phone's share sheet, so the person can keep it in Files or
/// Drive, or send it to themselves.
class DownloadDataTile extends ConsumerStatefulWidget {
  const DownloadDataTile({super.key});

  @override
  ConsumerState<DownloadDataTile> createState() => _DownloadDataTileState();
}

class _DownloadDataTileState extends ConsumerState<DownloadDataTile> {
  bool _busy = false;

  Future<void> _download() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final json = await ref.read(apiClientProvider).getText('/profile/export');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${myDataFileName(DateTime.now())}');
      await file.writeAsString(json);
      await SharePlus.instance.share(
        ShareParams(
          files: [XFile(file.path, mimeType: 'application/json')],
          subject: 'My U-Sports data',
        ),
      );
    } catch (e) {
      if (mounted) showFailure(context, e, fallback: 'Could not download your data');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SheetTile(
      leading: const IconTile(icon: Icons.download_outlined),
      title: 'Download my data',
      subtitle: 'A copy of the personal data U-Sports holds about you',
      trailing: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : null,
      onTap: _busy ? null : _download,
    );
  }
}
