import {IsUUID} from 'class-validator';
export class ConnectIntegrationDto { @IsUUID() projectId!:string; }
