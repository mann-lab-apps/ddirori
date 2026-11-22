"""Regression tests for GA4 response semantics. Synthetic numbers never represent live users."""
import datetime as dt
import runpy
import sys
import json
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import Mock, patch
from pathlib import Path
import unittest

api = runpy.run_path(str(Path(__file__).with_name("lesson-ga4-report.py")))
START, END = dt.date(2026, 11, 23), dt.date(2026, 11, 29)
MATURE = dt.date(2026, 12, 2)


def response(reached=20, activated=5, referred=2, metadata=None):
    rows = []
    for seg, step, count in [("1. New reached", "1. View", reached), ("2. New activated", "2. Start", activated),
                             ("3. Referral activated", "2. Start", referred)]:
        if count is not None:
            rows.append({"dimensionValues": [{"value": step}, {"value": seg}],
                         "metricValues": [{"value": str(count)}]})
    return {"funnelTable": {"dimensionHeaders": [{"name": "funnelStepName"}, {"name": "segment"}],
                            "metricHeaders": [{"name": "activeUsers"}], "rows": rows, "metadata": metadata or {}}}


def summary(data, today=MATURE, channel=None):
    return api["summarize"](data, today, START, END, channel)


class LessonReportTest(unittest.TestCase):
    def test_sequence_contract(self):
        plan = api["requests_for"](START, END, "google / organic")
        segments = plan["cohorts"][2]["segments"]
        for segment, expected in zip(segments, [["first_visit", "lesson_view"], ["first_visit", "lesson_view", "lesson_start"],
                                                ["lesson_view", "lesson_start"]], strict=True):
            seq, = segment["userSegment"]["userInclusionCriteria"]["andSequenceGroups"]
            self.assertEqual(seq["sequenceScoping"], "USER_CRITERIA_WITHIN_SAME_SESSION")
            events = []
            for step in seq["userSequenceSteps"]:
                self.assertEqual(step["stepScoping"], "USER_CRITERIA_WITHIN_SAME_EVENT")
                filters = step["segmentFilterExpression"]["andGroup"]["expressions"]
                event = filters[0]["segmentEventFilter"]["eventName"]
                events.append(event)
                field = filters[1]["segmentFilter"]
                self.assertEqual(field["stringFilter"]["value"], api["SITE"] if event == "first_visit" else api["LESSON"])
                if event == "lesson_view":
                    self.assertIn(api["string_filter"]("sessionSourceMedium", "google / organic", kind="segmentFilter"), filters)
            self.assertEqual(events, expected)
        self.assertNotIn("activities", plan)
        self.assertIn("activities", api["requests_for"](START, END, activities=True))

    def test_real_response_labels_and_rate(self):
        result = summary(response())
        self.assertEqual((result["decision"], result["start_rate"], result["referral_result"]),
                         ("activation_target_met", .25, "target_met"))
        self.assertEqual(summary(response(40, 5))["decision"], "review_first_play")

    def test_empty_rows_are_unknown_while_explicit_zero_is_valid(self):
        result = summary(response(None, None, None))
        self.assertIsNone(result["new_reached"])
        self.assertEqual(result["decision"], "withheld")
        zero = summary(response(0, 0, 0))
        self.assertEqual(zero["decision"], "insufficient_reach")
        self.assertIsNone(zero["start_rate"])
        self.assertEqual(summary(response(referred=None))["decision"], "activation_target_met")

    def test_incomplete_period_sample_and_mismatched_counts(self):
        for day in [dt.date(2026, 11, 22), END, dt.date(2026, 12, 1)]:
            self.assertEqual(summary(response(), day)["decision"], "withheld")
        data = response(metadata={"samplingMetadatas": [{"samplesReadCount": "20", "samplingSpaceSize": "100"}]})
        self.assertEqual(summary(data)["quality"], ["sampled"])
        self.assertEqual(summary(data)["decision"], "withheld")
        self.assertEqual(summary(response(2, 3))["decision"], "withheld")
        self.assertEqual(summary(response(), channel="google / organic")["decision"], "withheld")

    def run_cli(self, session_factory, *extra):
        output = StringIO()
        args = ["report", "--start", "2026-11-23", "--end", "2026-11-29", "--property", "1", *extra]
        with patch.object(sys, "argv", args), patch.dict(api["main"].__globals__, {"credentials": session_factory}), redirect_stdout(output):
            code = api["main"]()
        return code, json.loads(output.getvalue())

    def test_auth_failure_and_nonempty_week_rule(self):
        code, data = self.run_cli(Mock(side_effect=OSError("private detail")))
        self.assertEqual(code, 1)
        self.assertEqual(data["status"], "auth_unavailable")
        self.assertNotIn("private detail", str(data))
        result = api["summarize"](response(), MATURE, END, END)
        self.assertIn("not_a_seven_day_window", result["quality"])

    def test_partial_error_preserves_other_results(self):
        def reply(data, code=200):
            return Mock(ok=code == 200, status_code=code, json=Mock(return_value=data))
        session = Mock()
        empty = reply({"metadata": {"timeZone": "Asia/Seoul"}, "rowCount": 0})
        denied = reply({"error": {"status": "PERMISSION_DENIED"}}, 403)
        session.post.side_effect = [reply(response()), empty, empty, denied]
        code, data = self.run_cli(lambda: session, "--activities")
        self.assertEqual(code, 1)
        self.assertEqual(data["errors"]["activities"]["http"], 403)
        self.assertEqual(data["actions"]["status"], "no_rows")
        self.assertEqual(data["cohorts"]["new_reached"], 20)

    def test_quality_flags(self):
        q = api["quality"]({"metadata": {"subjectToThresholding": True, "timeZone": "UTC"},
                            "rows": [], "rowCount": 12})
        self.assertEqual(q, ["subjectToThresholding", "truncated", "timezone:UTC"])


if __name__ == "__main__":
    unittest.main()
