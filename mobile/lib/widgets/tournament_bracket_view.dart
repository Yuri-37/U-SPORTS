import 'package:flutter/material.dart';

import '../theme/app_theme.dart';
import '../theme/layout_tokens.dart';
import '../utils/participant_labels.dart';

/// Horizontal tournament columns (web [BracketView] parity).
class TournamentBracketView extends StatelessWidget {
  const TournamentBracketView({
    super.key,
    required this.brackets,
    required this.matches,
    required this.participantLabels,
    this.onMatchTap,
  });

  final List<Map<String, dynamic>> brackets;
  final List<Map<String, dynamic>> matches;
  final Map<String, String> participantLabels;
  final void Function(Map<String, dynamic> match)? onMatchTap;

  static const double _cellWidth = 168;

  static String slotLabelStatic(Map<String, String> labels, String? id, String slot, bool isBye) {
    if (slot == 'b' && isBye) return 'BYE';
    return participantDisplayLabel(labels, id, fallbackPrefix: 'Team');
  }

  static bool isWinnerStatic(String? participantId, String? winnerId) {
    return participantId != null &&
        winnerId != null &&
        participantId.isNotEmpty &&
        participantId == winnerId;
  }

  Map<String, dynamic>? _matchForBracket(String bracketId) {
    for (final m in matches) {
      if (m['bracket_id'] == bracketId) return m;
    }
    return null;
  }

  static String roundLabelStatic(int round, int maxRound, List<Map<String, dynamic>> inRound) {
    if (round == maxRound) return 'Final';
    final types = inRound.map((b) => b['bracket_type'] as String?).whereType<String>().toSet();
    if (round == maxRound - 1) {
      return types.contains('crossover_semi') ? 'Crossover semis' : 'Semi-Final';
    }
    if (types.contains('rr_pool_a')) return 'Pool A · Round robin';
    if (types.contains('rr_pool_b')) return 'Pool B · Round robin';
    return 'Round $round';
  }

  @override
  Widget build(BuildContext context) {
    final visible = brackets.where((b) => b['bracket_type'] != 'losers').toList();
    if (visible.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text('No bracket generated yet.', style: TextStyle(color: Color(0xFF8888A0))),
        ),
      );
    }

    final maxRound = visible.map((b) => (b['round'] as num?)?.toInt() ?? 0).reduce((a, c) => a > c ? a : c);
    final rounds = List.generate(maxRound, (i) => i + 1);

    int matchCount(int r) => visible.where((b) => (b['round'] as num?)?.toInt() == r).length;
    final maxMatchesInRound = rounds.map(matchCount).fold(0, (a, b) => a > b ? a : b);
    final canvasHeight = (maxMatchesInRound * 96.0 + 84).clamp(280.0, 1400.0);

    return SizedBox(
      height: canvasHeight,
      child: Container(
      decoration: BoxDecoration(
        color: LayoutTokens.bracketCanvas,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x22FFFFFF)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InteractiveViewer(
        boundaryMargin: const EdgeInsets.all(120),
        minScale: 0.35,
        maxScale: 2.5,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.all(20),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var ri = 0; ri < rounds.length; ri++) ...[
                  if (ri > 0)
                    _RoundBridge(
                      leftMatchCount: matchCount(rounds[ri - 1]),
                      rightMatchCount: matchCount(rounds[ri]),
                    ),
                  _RoundColumn(
                    round: rounds[ri],
                    maxRound: maxRound,
                    roundBrackets: visible
                        .where((b) => (b['round'] as num?)?.toInt() == rounds[ri])
                        .toList()
                      ..sort((a, b) => ((a['match_order'] as num?) ?? 0).compareTo((b['match_order'] as num?) ?? 0)),
                    cellWidth: _cellWidth,
                    participantLabels: participantLabels,
                    matchForBracket: _matchForBracket,
                    onMatchTap: onMatchTap,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
    );
  }
}

/// Classic elimination connector lines between two rounds (single-elim with pair merges).
class _RoundBridge extends StatelessWidget {
  const _RoundBridge({required this.leftMatchCount, required this.rightMatchCount});

  final int leftMatchCount;
  final int rightMatchCount;

  static const double _headerHeight = 44;

  @override
  Widget build(BuildContext context) {
    final useElimination =
        leftMatchCount == 2 * rightMatchCount && rightMatchCount > 0 && leftMatchCount >= 2;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: LayoutBuilder(
        builder: (context, c) {
          final h = c.maxHeight;
          if (!useElimination || !h.isFinite) {
            return SizedBox(
              width: 2,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: const Color(0x33FFFFFF),
                  borderRadius: BorderRadius.circular(1),
                ),
              ),
            );
          }
          return CustomPaint(
            size: Size(32, h),
            painter: _EliminationBridgePainter(
              headerHeight: _headerHeight,
              leftN: leftMatchCount,
              rightN: rightMatchCount,
              height: h,
            ),
          );
        },
      ),
    );
  }
}

class _EliminationBridgePainter extends CustomPainter {
  _EliminationBridgePainter({
    required this.headerHeight,
    required this.leftN,
    required this.rightN,
    required this.height,
  });

  final double headerHeight;
  final int leftN;
  final int rightN;
  final double height;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0x55FFFFFF)
      ..strokeWidth = 1.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final hm = (height - headerHeight).clamp(24.0, double.infinity);
    double yMid(int i, int n) => headerHeight + (i + 0.5) * hm / n;

    const xStem = 12.0;
    const xOut = 32.0;

    for (var j = 0; j < rightN; j++) {
      final i1 = 2 * j;
      final i2 = 2 * j + 1;
      if (i2 >= leftN) break;
      final y1 = yMid(i1, leftN);
      final y2 = yMid(i2, leftN);
      final yM = (y1 + y2) / 2;

      final path = Path()
        ..moveTo(0, y1)
        ..lineTo(xStem, y1)
        ..moveTo(0, y2)
        ..lineTo(xStem, y2)
        ..moveTo(xStem, y1)
        ..lineTo(xStem, y2)
        ..moveTo(xStem, yM)
        ..lineTo(xOut, yM);
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _EliminationBridgePainter oldDelegate) {
    return oldDelegate.height != height || oldDelegate.leftN != leftN || oldDelegate.rightN != rightN;
  }
}

class _RoundColumn extends StatelessWidget {
  const _RoundColumn({
    required this.round,
    required this.maxRound,
    required this.roundBrackets,
    required this.cellWidth,
    required this.participantLabels,
    required this.matchForBracket,
    this.onMatchTap,
  });

  final int round;
  final int maxRound;
  final List<Map<String, dynamic>> roundBrackets;
  final double cellWidth;
  final Map<String, String> participantLabels;
  final Map<String, dynamic>? Function(String bracketId) matchForBracket;
  final void Function(Map<String, dynamic> match)? onMatchTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: cellWidth,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.max,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              TournamentBracketView.roundLabelStatic(round, maxRound, roundBrackets),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Color(0xFF8888A0),
                letterSpacing: 0.6,
              ),
            ),
          ),
          Expanded(
            child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: roundBrackets.map((br) {
                final id = br['id'] as String;
                final match = matchForBracket(id);
                final isLive = match?['status'] == 'live';
                final isDone = match?['status'] == 'completed' || br['is_bye'] == true;
                final isBye = br['is_bye'] == true;
                final m = match;
                final cb = onMatchTap;

                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      onTap: m != null && cb != null ? () => cb(m) : null,
                      borderRadius: BorderRadius.circular(12),
                      child: AnimatedOpacity(
                        duration: const Duration(milliseconds: 200),
                        opacity: isDone ? 0.88 : 1,
                        child: Container(
                          width: cellWidth,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: isLive ? AppTheme.danger : const Color(0x14FFFFFF),
                              width: isLive ? 1.5 : 1,
                            ),
                            boxShadow: isLive
                                ? [BoxShadow(color: AppTheme.danger.withValues(alpha: 0.22), blurRadius: 10)]
                                : null,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              if (isLive)
                                Container(
                                  color: AppTheme.danger,
                                  padding: const EdgeInsets.symmetric(vertical: 2),
                                  child: const Text(
                                    'LIVE',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 2,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              _ParticipantRow(
                                label: TournamentBracketView.slotLabelStatic(
                                  participantLabels,
                                  br['participant_a_id'] as String?,
                                  'a',
                                  isBye,
                                ),
                                highlight: TournamentBracketView.isWinnerStatic(
                                  br['participant_a_id'] as String?,
                                  br['winner_id'] as String?,
                                ),
                              ),
                              _ParticipantRow(
                                label: TournamentBracketView.slotLabelStatic(
                                  participantLabels,
                                  br['participant_b_id'] as String?,
                                  'b',
                                  isBye,
                                ),
                                highlight: TournamentBracketView.isWinnerStatic(
                                  br['participant_b_id'] as String?,
                                  br['winner_id'] as String?,
                                ),
                                showTopBorder: true,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _ParticipantRow extends StatelessWidget {
  const _ParticipantRow({
    required this.label,
    required this.highlight,
    this.showTopBorder = false,
  });

  final String label;
  final bool highlight;
  final bool showTopBorder;

  @override
  Widget build(BuildContext context) {
    // Bracket cells sit on the always-dark bracketCanvas (matches web's
    // hardcoded bg-[#111118]) regardless of app theme, so colors here are
    // fixed dark-mode values, not LayoutTokens' brightness-aware ones.
    const successDark = Color(0xFF22C55E);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: highlight ? successDark.withValues(alpha: 0.12) : const Color(0xFF16161E),
        border: showTopBorder ? const Border(top: BorderSide(color: Color(0x14FFFFFF))) : null,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white),
            ),
          ),
          if (highlight) const Icon(Icons.check, size: 16, color: successDark),
        ],
      ),
    );
  }
}
