import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';

/// Self-service avatar upload/removal — mirrors the web `AvatarUpload`
/// component. Wraps a CircleAvatar with a small camera badge; tapping opens
/// a bottom sheet to pick a photo (gallery/camera) or remove the current
/// one. Athlete-only, matching the one place the web equivalent is used
/// (My Profile) — staff never reach the mobile app at all (router.dart
/// signs them out on sight).
class AvatarUploadButton extends ConsumerStatefulWidget {
  const AvatarUploadButton({
    super.key,
    required this.avatarUrl,
    required this.fallbackInitial,
    this.radius = 40,
  });

  final String? avatarUrl;
  final String fallbackInitial;
  final double radius;

  @override
  ConsumerState<AvatarUploadButton> createState() => _AvatarUploadButtonState();
}

class _AvatarUploadButtonState extends ConsumerState<AvatarUploadButton> {
  bool _busy = false;

  Future<void> _pickAndUpload(ImageSource source) async {
    final picker = ImagePicker();
    final XFile? picked = await picker.pickImage(source: source, maxWidth: 1024, imageQuality: 85);
    if (picked == null) return;

    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).postMultipart(
            '/profile/avatar',
            filePath: picked.path,
            fieldName: 'file',
          );
      ref.invalidate(profileProvider);
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('Could not upload photo');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await ref.read(apiClientProvider).deleteJson('/profile/avatar');
      ref.invalidate(profileProvider);
    } on ApiException catch (e) {
      _showError(e.message);
    } catch (_) {
      _showError('Could not remove photo');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showError(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  void _openSheet() {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUpload(ImageSource.gallery);
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(ctx);
                _pickAndUpload(ImageSource.camera);
              },
            ),
            if (widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty)
              ListTile(
                leading: Icon(Icons.delete_outline, color: LayoutTokens.danger(ctx)),
                title: Text('Remove photo', style: TextStyle(color: LayoutTokens.danger(ctx))),
                onTap: () {
                  Navigator.pop(ctx);
                  _remove();
                },
              ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Sits on the profile screen's navy hero, so it borrows HeroAvatar's
    // frosted-white treatment rather than a solid brand fill — a navy circle
    // on a navy gradient would have no visible edge.
    return Semantics(button: true, enabled: !_busy, label: 'Change profile photo', child: GestureDetector(
      onTap: _busy ? null : _openSheet,
      child: Stack(
        children: [
          Container(
            width: widget.radius * 2,
            height: widget.radius * 2,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.16),
              border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 2),
              image: widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty
                  ? DecorationImage(image: CachedNetworkImageProvider(widget.avatarUrl!), fit: BoxFit.cover)
                  : null,
            ),
            alignment: Alignment.center,
            child: widget.avatarUrl == null || widget.avatarUrl!.isEmpty
                ? Text(
                    widget.fallbackInitial,
                    style: TextStyle(
                      fontSize: widget.radius * 0.7,
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  )
                : null,
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppTheme.schoolSecondary,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: _busy
                  ? SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.schoolPrimary),
                    )
                  : Icon(Icons.camera_alt, size: 13, color: AppTheme.schoolPrimary),
            ),
          ),
        ],
      ),
    ));
  }
}
