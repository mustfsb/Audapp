use audapp_lib::{enumerate_endpoint_diagnostics, probe_endpoint};

const FILTER_KEYWORDS: &[&str] = &["audapp", "audiocodec", "hoparlör", "mikrofon"];

fn name_matches_filter(name: &str) -> bool {
    let lower = name.to_lowercase();
    FILTER_KEYWORDS.iter().any(|kw| lower.contains(kw))
}

fn ok_or_fail(flag: bool) -> &'static str {
    if flag {
        "OK"
    } else {
        "FAIL"
    }
}

fn main() {
    println!("=== Audapp Endpoint Diagnostics ===");
    println!();

    let endpoints = match enumerate_endpoint_diagnostics() {
        Ok(list) => list,
        Err(e) => {
            eprintln!("ERROR: Failed to enumerate endpoints: {}", e);
            std::process::exit(1);
        }
    };

    let matching: Vec<_> = endpoints
        .into_iter()
        .filter(|ep| name_matches_filter(&ep.friendly_name))
        .collect();

    if matching.is_empty() {
        eprintln!("ERROR: No Audapp-related audio endpoints found.");
        eprintln!("       (looked for: audapp, audiocodec, hoparlör, mikrofon)");
        std::process::exit(1);
    }

    let total = matching.len();
    let mut activated_ok = 0usize;
    let mut initialized_ok = 0usize;
    let mut started_ok = 0usize;
    let mut stopped_ok = 0usize;

    for (idx, ep) in matching.iter().enumerate() {
        println!(
            "[{}/{}] {} [{}]",
            idx + 1,
            total,
            ep.friendly_name,
            ep.data_flow
        );
        println!("  ID:    {}", ep.id);
        println!("  State: {}", ep.state);
        println!("  Default render:  {}", ep.is_default_render);
        println!("  Default capture: {}", ep.is_default_capture);
        println!();
        println!("  Probing...");

        let probe = probe_endpoint(ep.id.clone());

        println!("  Activate:        {}", ok_or_fail(probe.activate_ok));

        match &probe.mix_format {
            Some(fmt) => println!("  GetMixFormat:    OK — {}", fmt),
            None => println!("  GetMixFormat:    (no format returned)"),
        }

        match (probe.default_period_100ns, probe.min_period_100ns) {
            (Some(def), Some(min)) => println!(
                "  GetDevicePeriod: default={} (100ns units), min={} (100ns units)",
                def, min
            ),
            _ => println!("  GetDevicePeriod: (not available)"),
        }

        println!("  Initialize:      {}", ok_or_fail(probe.initialize_ok));
        println!("  Start:           {}", ok_or_fail(probe.start_ok));
        println!("  Stop:            {}", ok_or_fail(probe.stop_ok));

        if let Some(err) = &probe.error {
            println!("  Error:           {}", err);
        }

        if probe.activate_ok {
            activated_ok += 1;
        }
        if probe.initialize_ok {
            initialized_ok += 1;
        }
        if probe.start_ok {
            started_ok += 1;
        }
        if probe.stop_ok {
            stopped_ok += 1;
        }

        println!();
    }

    println!("=== Summary ===");
    println!("Endpoints probed:  {}", total);
    println!("Activated OK:      {}/{}", activated_ok, total);
    println!("Initialized OK:    {}/{}", initialized_ok, total);
    println!("Started OK:        {}/{}", started_ok, total);
    println!("Stopped OK:        {}/{}", stopped_ok, total);

    let all_passed = activated_ok == total
        && initialized_ok == total
        && started_ok == total
        && stopped_ok == total;

    println!(
        "All WASAPI steps passed: {}",
        if all_passed { "YES" } else { "NO" }
    );

    if !all_passed {
        std::process::exit(1);
    }
}
