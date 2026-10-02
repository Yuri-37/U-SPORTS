import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// The institution's logo, drawn from whatever format it was uploaded as.
///
/// Staff can upload an SVG as the school logo (the web accepts it and the
/// storage bucket allows it), but Android's bitmap decoder cannot read SVG --
/// `CachedNetworkImage` fails with "Input contained an error" and the app
/// silently fell back to the initials badge on every phone, while the web
/// (whose browsers render SVG natively) looked fine. SVG goes through
/// `flutter_svg` instead; everything else keeps the cached bitmap path.
///
/// Shows [fallback] while nothing can be drawn (a failed download, an
/// unparseable file), so the logo area never becomes a broken-image icon.
class InstitutionLogo extends StatelessWidget {
  const InstitutionLogo({
    super.key,
    required this.url,
    required this.height,
    required this.fallback,
    this.alignment = Alignment.center,
  });

  final String url;
  final double height;
  final Widget fallback;
  final Alignment alignment;

  /// Judged by the URL's path, not the whole string, so a `?v=2` cache-buster
  /// after `.svg` still counts.
  static bool isSvgUrl(String url) => (Uri.tryParse(url)?.path ?? url).toLowerCase().endsWith('.svg');

  @override
  Widget build(BuildContext context) {
    final placeholder = SizedBox(height: height, width: height);

    if (isSvgUrl(url)) {
      return SvgPicture.network(
        url,
        height: height,
        fit: BoxFit.contain,
        alignment: alignment,
        placeholderBuilder: (_) => placeholder,
        errorBuilder: (_, __, ___) => fallback,
      );
    }

    return CachedNetworkImage(
      imageUrl: url,
      height: height,
      fit: BoxFit.contain,
      alignment: alignment,
      placeholder: (_, __) => placeholder,
      errorWidget: (_, __, ___) => fallback,
    );
  }
}
