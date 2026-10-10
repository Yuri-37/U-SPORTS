import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../theme/app_theme.dart';
import '../../theme/layout_tokens.dart';

/// Shared page building blocks for the mobile app.
///
/// Every page is a navy gradient hero (title row, optional summary content,
/// optional tabs) with an off-white sheet overlapping it. The sheet's rounded
/// top corners sitting on the gradient is what gives the layered depth; the
/// content inside is grouped into white rounded surfaces with list rows.
///
/// Use [BrandPage.scroll] when the whole page scrolls (the hero scrolls away
/// with it) and [BrandPage.fixed] when the body manages its own scrolling --
/// typically a [TabBarView] under tabs held in the hero.

const double _sheetRadius = 28;

/// A phone held sideways has well under 480 logical pixels of height. The hero,
/// the tab bar and the bottom navigation together would then fill most of the
/// screen, so every page tightens them. (Tablets and portrait phones are
/// taller than this and are not affected.)
bool isCompactHeight(BuildContext context) => MediaQuery.sizeOf(context).height < 480;

class BrandPage extends StatelessWidget {
  const BrandPage.scroll({
    super.key,
    this.title,
    this.titleWidget,
    this.subtitle,
    this.actions = const [],
    this.hero,
    this.onRefresh,
    this.showBack,
    this.onBack,
    required List<Widget> this.children,
    this.sheetPadding = const EdgeInsets.fromLTRB(16, 22, 16, 32),
  })  : body = null,
        bottom = null;

  const BrandPage.fixed({
    super.key,
    this.title,
    this.titleWidget,
    this.subtitle,
    this.actions = const [],
    this.hero,
    this.bottom,
    this.showBack,
    this.onBack,
    required Widget this.body,
  })  : children = null,
        onRefresh = null,
        sheetPadding = EdgeInsets.zero;

  final String? title;

  /// Replaces [title] when the header needs more than text (e.g. the school
  /// logo + name on the tab roots).
  final Widget? titleWidget;
  final String? subtitle;
  final List<Widget> actions;

  /// Summary content shown on the gradient under the title row.
  final Widget? hero;

  /// Pinned to the bottom of the hero -- used for [BrandTabBar].
  final Widget? bottom;

  final Future<void> Function()? onRefresh;

  /// Defaults to showing a back arrow whenever the route can pop.
  final bool? showBack;
  final VoidCallback? onBack;

  final List<Widget>? children;
  final EdgeInsets sheetPadding;
  final Widget? body;

  @override
  Widget build(BuildContext context) {
    final canPop = showBack ?? context.canPop();

    final Widget page;
    if (children != null) {
      final sheet = Container(
        width: double.infinity,
        decoration: BoxDecoration(
          color: LayoutTokens.sheet(context),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(_sheetRadius)),
        ),
        // Sideways, the system bars sit at the left and right edges: keep the
        // content out from under them.
        padding: sheetPadding +
            EdgeInsets.only(
              left: MediaQuery.paddingOf(context).left,
              right: MediaQuery.paddingOf(context).right,
            ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: children!,
        ),
      );
      Widget list = ListView(
        padding: EdgeInsets.zero,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          _Hero(
            title: title,
            titleWidget: titleWidget,
            subtitle: subtitle,
            actions: actions,
            hero: hero,
            showBack: canPop,
            onBack: onBack,
            // The sheet is pulled up over this padding, so the gradient runs
            // underneath its rounded corners.
            bottomPadding: 20 + _sheetRadius,
          ),
          Transform.translate(offset: const Offset(0, -_sheetRadius), child: sheet),
        ],
      );
      if (onRefresh != null) {
        list = RefreshIndicator(onRefresh: onRefresh!, child: list);
      }
      page = Scaffold(backgroundColor: LayoutTokens.sheet(context), body: list);
    } else {
      page = Scaffold(
        // Shows behind the sheet's rounded corners; matches the hero's bottom
        // color so the join is seamless.
        backgroundColor: AppTheme.heroGradient().last,
        body: Column(
          children: [
            _Hero(
              title: title,
              titleWidget: titleWidget,
              subtitle: subtitle,
              actions: actions,
              hero: hero,
              bottom: bottom,
              showBack: canPop,
              onBack: onBack,
              bottomPadding: 16,
            ),
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(top: Radius.circular(_sheetRadius)),
                child: ColoredBox(
                  color: LayoutTokens.sheet(context),
                  // Left/right only: sideways, the system bars sit at the
                  // edges and must not cover the content.
                  child: SafeArea(top: false, bottom: false, child: body!),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // White status-bar icons over the navy hero.
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(statusBarColor: Colors.transparent),
      child: page,
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({
    required this.title,
    required this.titleWidget,
    required this.subtitle,
    required this.actions,
    required this.hero,
    required this.showBack,
    required this.onBack,
    required this.bottomPadding,
    this.bottom,
  });

  final String? title;
  final Widget? titleWidget;
  final String? subtitle;
  final List<Widget> actions;
  final Widget? hero;
  final Widget? bottom;
  final bool showBack;
  final VoidCallback? onBack;
  final double bottomPadding;

  @override
  Widget build(BuildContext context) {
    // Everything in the hero is white: force icon buttons (M3 would otherwise
    // tint them from the color scheme) and default text accordingly.
    final compact = isCompactHeight(context);
    final heroTheme = Theme.of(context).copyWith(
      iconTheme: const IconThemeData(color: Colors.white),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(foregroundColor: Colors.white),
      ),
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: AppTheme.heroGradient(),
        ),
      ),
      child: CustomPaint(
        painter: _HeroTexturePainter(),
        child: SafeArea(
          bottom: false,
          child: Theme(
            data: heroTheme,
            child: DefaultTextStyle.merge(
              style: const TextStyle(color: Colors.white),
              child: Padding(
                padding: EdgeInsets.fromLTRB(0, compact ? 0 : 4, 0, compact ? (bottomPadding - 12).clamp(8.0, 100.0) : bottomPadding),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    _titleRow(context, compact, inlineTabs: compact ? bottom : null),
                    if (hero != null)
                      Padding(padding: EdgeInsets.fromLTRB(20, compact ? 6 : 14, 20, 0), child: hero),
                    if (bottom != null && !compact)
                      Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 0), child: bottom),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _titleRow(BuildContext context, bool compact, {Widget? inlineTabs}) {
    final titleContent = titleWidget ??
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (title != null)
              Semantics(
                header: true,
                child: Text(
                  title!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppTheme.display(size: 21, color: Colors.white, height: 1.2),
                ),
              ),
            if (subtitle != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.78),
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
          ],
        );

    return SizedBox(
      height: compact ? 48 : 56,
      child: Row(
        children: [
          if (showBack)
            IconButton(
              tooltip: 'Back',
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
              onPressed: onBack ?? () => context.pop(),
            )
          else
            const SizedBox(width: 20),
          Expanded(flex: 2, child: titleContent),
          // Sideways the tabs share the title's row instead of taking their own.
          if (inlineTabs != null)
            Flexible(
              flex: 3,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 360),
                child: inlineTabs,
              ),
            ),
          ...actions,
          const SizedBox(width: 8),
        ],
      ),
    );
  }
}

/// Dot grid plus a soft light bloom in the top-right corner -- texture that
/// keeps the gradient from reading as a flat template fill.
class _HeroTexturePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final glow = Paint()
      ..shader = RadialGradient(
        colors: [Colors.white.withValues(alpha: 0.12), Colors.white.withValues(alpha: 0)],
      ).createShader(
        Rect.fromCircle(center: Offset(size.width * 0.92, 0), radius: size.width * 0.75),
      );
    canvas.drawRect(Offset.zero & size, glow);

    final dot = Paint()..color = Colors.white.withValues(alpha: 0.06);
    const pitch = 22.0;
    for (double y = pitch / 2; y < size.height; y += pitch) {
      for (double x = pitch / 2; x < size.width; x += pitch) {
        canvas.drawCircle(Offset(x, y), 1.0, dot);
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Translucent card on the gradient with an inset highlight along its top
/// edge -- the highlight is what makes it read as glass.
class FrostedCard extends StatelessWidget {
  const FrostedCard({super.key, required this.child, this.padding = const EdgeInsets.all(18)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.white.withValues(alpha: 0.20),
            Colors.white.withValues(alpha: 0.08),
          ],
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.14),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            top: 0,
            left: 20,
            right: 20,
            height: 1,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    Colors.white.withValues(alpha: 0),
                    Colors.white.withValues(alpha: 0.6),
                    Colors.white.withValues(alpha: 0),
                  ],
                ),
              ),
            ),
          ),
          Padding(padding: padding, child: child),
        ],
      ),
    );
  }
}

/// Equal-width figures inside a [FrostedCard], split by hairlines.
class FrostedStats extends StatelessWidget {
  const FrostedStats({super.key, required this.stats});

  final List<({String label, String value})> stats;

  @override
  Widget build(BuildContext context) {
    final cells = <Widget>[];
    for (var i = 0; i < stats.length; i++) {
      if (i > 0) {
        cells.add(Container(width: 1, height: 42, color: Colors.white.withValues(alpha: 0.2)));
      }
      cells.add(
        Expanded(
          child: Column(
            children: [
              Text(
                stats[i].label.toUpperCase(),
                textAlign: TextAlign.center,
                style: AppTheme.overline(Colors.white.withValues(alpha: 0.78)),
              ),
              const SizedBox(height: 6),
              Text(
                stats[i].value,
                textAlign: TextAlign.center,
                style: AppTheme.display(size: 28, color: Colors.white, height: 1.05),
              ),
            ],
          ),
        ),
      );
    }
    return Row(children: cells);
  }
}

/// Circular avatar for the hero: the photo if there is one, otherwise the
/// first initial on a translucent white disc (never navy-on-navy).
class HeroAvatar extends StatelessWidget {
  const HeroAvatar({
    super.key,
    this.imageUrl,
    required this.name,
    this.radius = 36,
    this.fit = BoxFit.cover,
  });

  final String? imageUrl;
  final String name;
  final double radius;

  /// [BoxFit.cover] (default) fills and crops the circle — for real photo
  /// avatars. [BoxFit.contain] instead shows the whole image, sized smaller
  /// than the circle and centered, so a non-square mark (e.g. an institution
  /// crest) never gets its corners cut off.
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final hasImage = imageUrl != null && imageUrl!.trim().isNotEmpty;
    final contained = fit == BoxFit.contain;
    return Semantics(image: true, excludeSemantics: true, label: contained ? name : 'Photo of $name', child: Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Colors.white.withValues(alpha: 0.16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.3), width: 2),
        image: hasImage && !contained
            ? DecorationImage(image: CachedNetworkImageProvider(imageUrl!), fit: BoxFit.cover)
            : null,
      ),
      alignment: Alignment.center,
      child: hasImage && contained
          ? CachedNetworkImage(imageUrl: imageUrl!, height: radius * 1.4, fit: BoxFit.contain)
          : (hasImage
              ? null
              : Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: AppTheme.display(size: radius * 0.78, color: Colors.white, height: 1),
                )),
    ));
  }
}

/// Round translucent icon button for the hero's title row.
class HeroIconButton extends StatelessWidget {
  const HeroIconButton({super.key, required this.icon, required this.onPressed, this.tooltip});

  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final button = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: SizedBox(
        width: 44,
        height: 44,
        child: Material(
          color: Colors.white.withValues(alpha: 0.14),
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onPressed,
            child: Icon(icon, size: 21, color: Colors.white),
          ),
        ),
      ),
    );
    return tooltip == null ? button : Tooltip(message: tooltip!, child: button);
  }
}

/// Pill with a status dot, for use on the gradient.
class HeroPill extends StatelessWidget {
  const HeroPill({super.key, required this.text, this.dotColor});

  final String text;
  final Color? dotColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: dotColor ?? AppTheme.schoolSecondary,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 8),
          Text(text.toUpperCase(), style: AppTheme.overline(Colors.white)),
        ],
      ),
    );
  }
}

/// Segmented control for tabs held in the hero: a translucent track with a
/// solid white pill behind the selected tab.
class BrandTabBar extends StatelessWidget {
  const BrandTabBar({super.key, required this.controller, required this.tabs});

  final TabController controller;
  final List<String> tabs;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 46,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(15),
      ),
      child: TabBar(
        controller: controller,
        tabs: [for (final t in tabs) Tab(text: t, height: 38)],
        indicator: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(11),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.12),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        labelColor: AppTheme.schoolPrimary,
        unselectedLabelColor: Colors.white.withValues(alpha: 0.88),
        labelStyle: GoogleFonts.plusJakartaSans(fontSize: 13.5, fontWeight: FontWeight.w700),
        unselectedLabelStyle: GoogleFonts.plusJakartaSans(fontSize: 13.5, fontWeight: FontWeight.w600),
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        splashBorderRadius: BorderRadius.circular(11),
      ),
    );
  }
}

/// Heading that opens a block on the sheet, with an optional trailing link.
class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.leading,
    this.trailing,
    this.padding = const EdgeInsets.fromLTRB(4, 24, 4, 12),
  });

  final String title;
  final Widget? leading;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (leading != null) ...[leading!, const SizedBox(width: 8)],
          Expanded(
            child: Text(
              title,
              style: AppTheme.display(
                size: 18,
                height: 1.2,
                color: LayoutTokens.primaryText(context),
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// A compact text link for section headers ("See all" style).
class SectionLink extends StatelessWidget {
  const SectionLink({super.key, required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: AppTheme.brandInk(context),
          ),
        ),
      ),
    );
  }
}

/// A white rounded surface on the sheet. Rows are separated by hairlines.
class SheetGroup extends StatelessWidget {
  const SheetGroup({super.key, required this.children, this.padding, this.dividers = true});

  final List<Widget> children;
  final EdgeInsets? padding;
  final bool dividers;

  @override
  Widget build(BuildContext context) {
    final b = Theme.of(context).brightness;
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      if (i > 0 && dividers) {
        rows.add(Divider(height: 1, indent: 16, endIndent: 16, color: LayoutTokens.borderSubtle(context)));
      }
      rows.add(children[i]);
    }
    return Container(
      decoration: BoxDecoration(
        color: LayoutTokens.cardBackground(context),
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.cardShadow(b),
        border: b == Brightness.dark ? Border.all(color: LayoutTokens.borderSubtle(context)) : null,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: Padding(
          padding: padding ?? EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows),
        ),
      ),
    );
  }
}

/// One row inside a [SheetGroup]: leading tile, title + subtitle, trailing.
class SheetTile extends StatelessWidget {
  const SheetTile({
    super.key,
    this.leading,
    required this.title,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.titleMaxLines = 1,
    this.titleColor,
  });

  final Widget? leading;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final int titleMaxLines;

  /// Overrides the title color -- e.g. a destructive action like Sign out.
  final Color? titleColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 14)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: titleMaxLines,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: titleColor ?? LayoutTokens.primaryText(context),
                    ),
                  ),
                  if (subtitle != null && subtitle!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        subtitle!,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: LayoutTokens.mutedText(context)),
                      ),
                    ),
                ],
              ),
            ),
            if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          ],
        ),
      ),
    );
  }
}

/// Tinted rounded square holding an icon or emoji -- the leading element of a
/// list row. Distinct tints per category make a list scan quickly.
class IconTile extends StatelessWidget {
  const IconTile({super.key, this.icon, this.emoji, this.color, this.size = 44});

  final IconData? icon;
  final String? emoji;
  final Color? color;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = color ?? AppTheme.brandInk(context);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withValues(alpha: dark ? 0.18 : 0.10),
        borderRadius: BorderRadius.circular(size * 0.32),
      ),
      child: emoji != null
          ? Text(emoji!, style: TextStyle(fontSize: size * 0.46))
          : Icon(icon, color: c, size: size * 0.5),
    );
  }
}

/// Rank number in a tinted square; the top three get the brand color.
class RankBadge extends StatelessWidget {
  const RankBadge({super.key, required this.rank});

  final int rank;

  @override
  Widget build(BuildContext context) {
    final top = rank <= 3;
    final c = top ? AppTheme.brandInk(context) : LayoutTokens.mutedText(context);
    return Container(
      width: 40,
      height: 40,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: c.withValues(alpha: top ? 0.12 : 0.08),
        borderRadius: BorderRadius.circular(13),
      ),
      child: Text('$rank', style: AppTheme.display(size: 16, color: c, height: 1)),
    );
  }
}

/// Muted per-sport tint so sport rows are distinguishable at a glance.
Color sportTint(BuildContext context, String? sport) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  switch (sport) {
    case 'basketball':
      return dark ? const Color(0xFFFB923C) : const Color(0xFFC2410C);
    case 'volleyball':
      return dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8);
    case 'table-tennis':
      return dark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C);
    default:
      return AppTheme.brandInk(context);
  }
}

/// Empty / error message centred on the sheet.
class SheetMessage extends StatelessWidget {
  const SheetMessage({super.key, required this.text, this.icon});

  final String text;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 24),
      child: Column(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 36, color: LayoutTokens.mutedText(context)),
            const SizedBox(height: 10),
          ],
          Text(
            text,
            textAlign: TextAlign.center,
            style: TextStyle(color: LayoutTokens.mutedText(context), height: 1.5),
          ),
        ],
      ),
    );
  }
}
