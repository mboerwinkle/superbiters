<?php
try{
	$dirIterator = new DirectoryIterator('.');
	header('Content-type: text/plain');
	foreach($dirIterator as $fileInfo){
		$name = $fileInfo->getFilename();
		if(strcmp(strtolower(substr($name, -6)), '.sm.gz') == 0){
			print($fileInfo->getFilename()."\n");
		}
	}
	exit();
}catch(Exception $e){
	http_response_code(500);
	exit('Failed to get filenames:'.$e);
}
?>
