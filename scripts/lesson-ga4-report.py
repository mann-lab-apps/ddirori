# /// script
# requires-python = ">=3.10"
# dependencies = ["google-auth[requests]>=2.30,<3"]
# ///
"""Read-only GA4 report for the free lesson acquisition experiment."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
from zoneinfo import ZoneInfo

HOSTS = ["ddirori.com", "www.ddirori.com"]
PATHS = ["/lessons/", "/lessons/index.html"]
SITE = r"https://(www\.)?ddirori\.com/.*"
LESSON = r"https://(www\.)?ddirori\.com/lessons/(index\.html)?([?#].*)?"
EVENTS = ["lesson_view", "lesson_start", "lesson_activity_play", "lesson_activity_end",
          "lesson_print_request", "lesson_teacher_share", "lesson_home_copy", "lesson_home_open",
          "lesson_use_draft"]
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
TZ = ZoneInfo("Asia/Seoul")


def string_filter(field, value, match="EXACT", kind="filter"):
    return {kind: {"fieldName": field, "stringFilter": {
        "matchType": match, "value": value, "caseSensitive": True}}}


def all_of(expressions):
    return {"andGroup": {"expressions": expressions}}


def exclude_internal(kind):
    return [{"notExpression": string_filter(field, value, kind=kind)}
            for field, value in [("sessionMedium", "qa"), ("sessionSource", "codex_setup")]]


def sequence_step(event, *, referral=False, channel=None):
    fields = [{"segmentEventFilter": {"eventName": event}},
              string_filter("pageLocation", SITE if event == "first_visit" else LESSON,
                            "FULL_REGEXP", "segmentFilter"), *exclude_internal("segmentFilter")]
    if channel and event == "lesson_view":
        fields.append(string_filter("sessionSourceMedium", channel, kind="segmentFilter"))
    if referral:
        for pair in ["utm_source=teacher", "utm_medium=referral"]:
            fields.append(string_filter("pageLocation", "[?&]" + pair + "(&|#|$)",
                                        "PARTIAL_REGEXP", "segmentFilter"))
    return {"stepScoping": "USER_CRITERIA_WITHIN_SAME_EVENT", "segmentFilterExpression": all_of(fields)}


def sequence_segment(name, steps):
    return {"name": name, "userSegment": {"userInclusionCriteria": {"andSequenceGroups": [{
        "sequenceScoping": "USER_CRITERIA_WITHIN_SAME_SESSION", "userSequenceSteps": steps}]}}}


def requests_for(start, end, channel=None, activities=False):
    dates = [{"startDate": start.isoformat(), "endDate": end.isoformat()}]
    view = sequence_step("lesson_view", channel=channel)
    start_play = sequence_step("lesson_start")
    first = sequence_step("first_visit")
    # Segment membership enforces the order within one session. A closed funnel alone
    # may cross a session boundary. Count each qualified user at the chosen step.
    segments = [sequence_segment("New reached", [first, view]),
                sequence_segment("New activated", [first, view, start_play]),
                sequence_segment("Referral activated", [sequence_step("lesson_view", referral=True, channel=channel), start_play])]
    steps = [{"name": label, "filterExpression": all_of([
        {"funnelEventFilter": {"eventName": event}},
        string_filter("pageLocation", LESSON, "FULL_REGEXP", "funnelFieldFilter")])}
        for label, event in [("View", "lesson_view"), ("Start", "lesson_start")]]
    funnel = {"dateRanges": dates, "segments": segments, "funnel": {"isOpenFunnel": False, "steps": steps}}

    def core(dimensions, events):
        fields = [{"filter": {"fieldName": field, "inListFilter": {"values": values, "caseSensitive": True}}}
                  for field, values in [("hostName", HOSTS), ("pagePath", PATHS), ("eventName", events)]]
        if channel:
            fields.append(string_filter("sessionSourceMedium", channel))
        return {"dateRanges": dates, "dimensions": [{"name": name} for name in dimensions],
                "metrics": [{"name": "totalUsers"}, {"name": "eventCount"}],
                "dimensionFilter": all_of(fields + exclude_internal("filter")), "limit": "10000"}

    result = {"cohorts": ("v1alpha", "runFunnelReport", funnel),
              "actions": ("v1beta", "runReport", core(["eventName"], EVENTS)),
              "channels": ("v1beta", "runReport", core(["eventName", "sessionSourceMedium"], ["lesson_view", "lesson_start"]))}
    if activities:
        result["activities"] = ("v1beta", "runReport", core(["eventName", "customEvent:content_slug"],
                                                            ["lesson_activity_play", "lesson_activity_end"]))
    return result


def rows_of(report):
    dims = [x["name"] for x in report.get("dimensionHeaders", [])]
    metrics = [x["name"] for x in report.get("metricHeaders", [])]
    rows = []
    for row in report.get("rows", []):
        values = dict(zip(dims, [x["value"] for x in row["dimensionValues"]], strict=True))
        values.update(dict(zip(metrics, [x.get("value") for x in row["metricValues"]], strict=True)))
        rows.append(values)
    return rows


def quality(report):
    meta = report.get("metadata", {})
    warnings = []
    for key in ["subjectToThresholding", "dataLossFromOtherRow", "dataTruncationReasons", "emptyReason"]:
        if meta.get(key):
            warnings.append(key)
    if any(int(m.get("samplesReadCount", 0)) < int(m.get("samplingSpaceSize", 0))
           for m in meta.get("samplingMetadatas", [])):
        warnings.append("sampled")
    if report.get("rowCount", 0) > len(report.get("rows", [])):
        warnings.append("truncated")
    if meta.get("timeZone") and meta["timeZone"] != "Asia/Seoul":
        warnings.append("timezone:" + meta["timeZone"])
    return warnings


def summarize(funnel, today, start, end, channel=None):
    table = funnel["funnelTable"]
    rows = rows_of(table)
    values = {}
    for key, segment, step in [("new_reached", "1. New reached", "1. View"),
                               ("new_activated", "2. New activated", "2. Start"),
                               ("referral_activated", "3. Referral activated", "2. Start")]:
        hits = [row["activeUsers"] for row in rows if row.get("segment") == segment and row.get("funnelStepName") == step]
        values[key] = int(hits[0]) if len(hits) == 1 and hits[0] is not None else None
    reached, activated, referred = values.values()
    warnings = quality(table)
    if start > today:
        warnings.append("period_not_started")
    elif today < end + dt.timedelta(days=3):
        warnings.append("period_not_mature")
    if (end - start).days != 6:
        warnings.append("not_a_seven_day_window")
    usable = not warnings and not channel
    decision = "withheld"
    referral_result = "withheld"
    rate = None
    if reached is None or activated is None:
        warnings.append("missing_acquisition_row")
    elif activated > reached:
        warnings.append("inconsistent_cohorts")
    else:
        rate = activated / reached if reached else None
        if usable:
            decision = ("insufficient_reach" if reached < 20 else
                        ("activation_target_met" if activated >= 5 and rate >= .25 else "review_first_play"))
    if referred is None:
        warnings.append("missing_referral_row")
    elif usable:
        referral_result = "target_met" if referred >= 2 else "below_target"
    return {**values, "start_rate": rate, "quality": warnings, "decision": decision, "referral_result": referral_result}


def credentials():
    import google.auth
    from google.auth.transport.requests import AuthorizedSession
    local = Path.home() / ".config/ddirori/ga4/credentials.json"
    path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or (str(local) if local.is_file() else None)
    creds, _ = (google.auth.load_credentials_from_file(path, scopes=[SCOPE]) if path
                else google.auth.default(scopes=[SCOPE]))
    return AuthorizedSession(creds)


def emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--end", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--property", default=os.environ.get("DDIRORI_GA4_PROPERTY_ID"), help="GA4 numeric property ID")
    parser.add_argument("--channel", help="optional exact GA4 sessionSourceMedium, e.g. google / organic")
    parser.add_argument("--activities", action="store_true", help="requires the content_slug event custom dimension")
    parser.add_argument("--plan", action="store_true", help="print API requests without authenticating or sending")
    args = parser.parse_args()
    if args.start > args.end:
        parser.error("--end must be on or after --start")
    requests = requests_for(args.start, args.end, args.channel, args.activities)
    if args.plan:
        emit(requests)
        return 0
    if not args.property or not re.fullmatch(r"[1-9][0-9]*", args.property):
        parser.error("set --property to the numeric Ddirori property ID")
    report = {"start": str(args.start), "end": str(args.end), "property": args.property, "channel": args.channel}
    try:
        session = credentials()
    except Exception as error:
        emit({**report, "status": "auth_unavailable", "error_type": type(error).__name__})
        return 1
    errors = {}
    for name, (version, method, body) in requests.items():
        try:
            url = f"https://analyticsdata.googleapis.com/{version}/properties/{args.property}:{method}"
            response = session.post(url, json=body, timeout=30)
            if not response.ok:
                error = response.json().get("error", {})
                errors[name] = {"http": response.status_code, "status": error.get("status"),
                                "reasons": [d["reason"] for d in error.get("details", []) if "reason" in d]}
                continue
            data = response.json()
            if name == "cohorts":
                report[name] = summarize(data, dt.datetime.now(TZ).date(), args.start, args.end, args.channel)
            else:
                rows = rows_of(data)
                report[name] = {"status": "ok" if rows else "no_rows", "quality": quality(data),
                                "timezone": data.get("metadata", {}).get("timeZone"), "rows": rows}
        except Exception as error:
            errors[name] = {"error_type": type(error).__name__}
    # The Core API exposes the property timezone; the funnel does not.
    if "cohorts" in report and report.get("actions", {}).get("timezone") != "Asia/Seoul":
        report["cohorts"]["quality"].append("property_timezone_unverified")
        report["cohorts"].update(decision="withheld", referral_result="withheld")
    report.update(status="partial_error" if errors else "queried", errors=errors)
    emit(report)
    return int(bool(errors))


if __name__ == "__main__":
    sys.exit(main())
