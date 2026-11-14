<?php
declare(strict_types=1);

/** Metrics use completed, non-cancelled lessons; both formats count once. */
function attendance_metrics(array $courses, array $lessons, array $students, array $attendance, int $now): array {
    $index = [];
    foreach ($attendance as $a) $index[$a['lesson_id']][(string)$a['user_id']] = $a['format'];
    $result = [];
    foreach ($courses as $c) {
        $group = array_values(array_filter($students, fn($s) => $s['course_id'] === $c['id']));
        $ls = array_values(array_filter($lessons, fn($l) => $l['course_id'] === $c['id']));
        $finished = array_filter($ls, fn($l) => !$l['cancelled'] && (int)$l['end_at'] <= $now);
        $members = array_fill_keys(array_map(fn($s) => (string)$s['id'], $group), true);
        $lessonTotals = [];
        foreach ($ls as $l) {
            $online = 0; $offline = 0;
            if (!$l['cancelled']) foreach ($index[$l['id']] ?? [] as $sid => $format) {
                if (!isset($members[(string)$sid])) continue;
                if ($format === 'online') $online++;
                if ($format === 'offline') $offline++;
            }
            $completed = !$l['cancelled'] && (int)$l['end_at'] <= $now;
            $lessonTotals[$l['id']] = ['online'=>$online,'offline'=>$offline,'present'=>$online+$offline,
                'absent'=>$completed ? max(0,count($group)-$online-$offline) : null,
                'completed'=>$completed,'cancelled'=>(bool)$l['cancelled']];
        }
        $studentTotals = [];
        foreach ($group as $s) {
            $present = 0; $online = 0; $offline = 0;
            foreach ($finished as $l) {
                $format = $index[$l['id']][(string)$s['id']] ?? '';
                if ($format === 'online') $online++;
                if ($format === 'offline') $offline++;
            }
            $present = $online + $offline; $total = count($finished);
            $studentTotals[(string)$s['id']] = ['present'=>$present,'completed'=>$total,'online'=>$online,
                'offline'=>$offline,'absent'=>$total-$present,'percent'=>$total ? round(100*$present/$total,1) : null];
        }
        $result[$c['id']] = ['students'=>$studentTotals,'lessons'=>$lessonTotals,'enrolled'=>count($group),
            'completed'=>count($finished),'final'=>(int)$c['end_at'] <= $now];
    }
    return $result;
}
