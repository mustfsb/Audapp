use audapp_lib::capture_discovery_snapshot;

fn main() {
    let snapshot = capture_discovery_snapshot();

    println!("source={}", snapshot.status.source);
    println!("state={}", snapshot.status.state);
    println!("device_count={}", snapshot.status.device_count);
    println!("session_count={}", snapshot.status.session_count);

    for warning in &snapshot.status.warnings {
        println!("warning={warning}");
    }

    for session in snapshot.sessions {
        println!("---");
        println!("display_name={}", session.display_name);
        println!("process_name={}", session.process_name.as_deref().unwrap_or(""));
        println!(
            "process_id={}",
            session
                .process_id
                .map(|value| value.to_string())
                .unwrap_or_default()
        );
        println!(
            "device_id={}",
            session.device_id.as_deref().unwrap_or("")
        );
        println!("session_id={}", session.session_id.as_deref().unwrap_or(""));
        println!(
            "session_instance_id={}",
            session.session_instance_id.as_deref().unwrap_or("")
        );
        println!(
            "grouping_param={}",
            session.grouping_param.as_deref().unwrap_or("")
        );
        println!(
            "executable_path={}",
            session.executable_path.as_deref().unwrap_or("")
        );
        println!(
            "app_user_model_id={}",
            session.app_user_model_id.as_deref().unwrap_or("")
        );
        println!(
            "package_full_name={}",
            session.package_full_name.as_deref().unwrap_or("")
        );
        println!(
            "package_family_name={}",
            session.package_family_name.as_deref().unwrap_or("")
        );
        println!("state={}", session.state);
        println!("is_system_sounds={}", session.is_system_sounds);
    }
}
